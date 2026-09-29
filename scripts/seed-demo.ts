/**
 * Seed a demo organisation through the real API, the way a browser would: sign up,
 * create projects and sites, upload every photo in demo-data/ with a signed upload, confirm
 * it (Cloudinary re-fetch, tagging, embeddings, Trust Score), review one flagged photo and
 * generate a report. Nothing is written to the database directly.
 *
 *   pnpm seed:demo                                 # against the API on localhost:8787
 *   SEED_BASE_URL=https://pramaan.onrender.com pnpm seed:demo
 *
 * Optional: SEED_EMAIL (default demo@pramaan.app), SEED_PASSWORD (default: generated and
 * printed at the end).
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import piexif from 'piexifjs';
import { DEMO_ORG, DEMO_PHOTOS, DEMO_PROJECTS, type DemoPhoto } from './demo-manifest.js';

const DAY_MS = 86_400_000;
const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'demo-data');
const baseUrl = (process.env.SEED_BASE_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
const email = process.env.SEED_EMAIL ?? 'demo@pramaan.app';
const password = process.env.SEED_PASSWORD ?? randomBytes(9).toString('base64url');

let cookie = '';

class SeedError extends Error {}

/** A JSON request to the API with the session cookie; throws with the API's message. */
async function api<T>(method: string, route: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}/api${route}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(cookie && { Cookie: cookie }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0]!;
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? res.statusText;
    throw new SeedError(`${method} ${route} → ${res.status}: ${message}`);
  }
  return data as T;
}

const isoDay = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);

/** EXIF "YYYY:MM:DD HH:MM:SS", mid-morning on the given day (UTC, as the API reads it). */
const exifTime = (daysAgo: number) =>
  `${isoDay(daysAgo).replace(/-/g, ':')} ${String(5 + (daysAgo % 5)).padStart(2, '0')}:${String((daysAgo * 7) % 60).padStart(2, '0')}:00`;

/** The file's bytes with the demo capture time and GPS written in, as a phone camera would. */
function withDemoExif(photo: DemoPhoto): Buffer {
  const file = fs.readFileSync(path.join(dataDir, photo.file));
  if (photo.daysAgo === undefined && !photo.at) return file;
  const exif: piexif.ExifDict = { '0th': {}, Exif: {}, GPS: {} };
  exif['0th']![piexif.ImageIFD.Software] = 'Pramaan demo seed';
  if (photo.daysAgo !== undefined) {
    exif.Exif![piexif.ExifIFD.DateTimeOriginal] = exifTime(photo.daysAgo);
  }
  if (photo.at) {
    exif.GPS![piexif.GPSIFD.GPSLatitudeRef] = photo.at.lat >= 0 ? 'N' : 'S';
    exif.GPS![piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(
      Math.abs(photo.at.lat),
    );
    exif.GPS![piexif.GPSIFD.GPSLongitudeRef] = photo.at.lng >= 0 ? 'E' : 'W';
    exif.GPS![piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(
      Math.abs(photo.at.lng),
    );
  }
  return Buffer.from(piexif.insert(piexif.dump(exif), file.toString('binary')), 'binary');
}

interface Asset {
  id: string;
  trustScore: number;
  trustBand: 'verified' | 'review' | 'flagged';
}

/** Signed direct upload to Cloudinary (or the fake in tests), then confirm with the API. */
async function uploadPhoto(bytes: Buffer, filename: string, projectId: string, siteId?: string) {
  const { uploadUrl, params } = await api<{ uploadUrl: string; params: Record<string, string> }>(
    'POST',
    '/uploads/signature',
    { projectId, ...(siteId && { siteId }) },
  );
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), filename);
  const res = await fetch(uploadUrl, { method: 'POST', body: form });
  const uploaded = (await res.json().catch(() => ({}))) as {
    public_id?: string;
    error?: { message: string };
  };
  if (!res.ok || !uploaded.public_id) {
    throw new SeedError(`Upload of ${filename} failed: ${uploaded.error?.message ?? res.status}`);
  }
  return api<Asset>('POST', '/assets/confirm', {
    publicId: uploaded.public_id,
    projectId,
    ...(siteId && { siteId }),
  });
}

async function waitForReport(id: string) {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const report = await api<{
      status: string;
      claimCount: number;
      droppedClaims: number;
      error: string | null;
    }>('GET', `/reports/${id}`);
    if (report.status !== 'generating') return report;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new SeedError('The report was still generating after 5 minutes');
}

async function main() {
  const health = await fetch(`${baseUrl}/api/health`).catch(() => null);
  if (!health?.ok) {
    throw new SeedError(
      `No healthy Pramaan API at ${baseUrl}. Start it (pnpm dev) or set SEED_BASE_URL.`,
    );
  }

  try {
    await api('POST', '/auth/signup', {
      orgName: DEMO_ORG.name,
      name: DEMO_ORG.admin,
      email,
      password,
    });
  } catch (err) {
    if (err instanceof SeedError && err.message.includes('409')) {
      throw new SeedError(
        `${email} already has an account, so this server was probably seeded already. Use SEED_EMAIL=… to seed another demo organisation.`,
      );
    }
    throw err;
  }
  console.log(`Signed up ${DEMO_ORG.name} (${email})`);

  const projectIds = new Map<string, string>();
  const siteIds = new Map<string, string>();
  for (const project of DEMO_PROJECTS) {
    const created = await api<{ id: string }>('POST', '/projects', {
      name: project.name,
      description: project.description,
      startDate: isoDay(project.startDaysAgo),
      sdgGoals: project.sdgGoals,
      csrCategory: project.csrCategory,
    });
    projectIds.set(project.key, created.id);
    for (const site of project.sites) {
      const s = await api<{ id: string }>('POST', `/projects/${created.id}/sites`, {
        name: site.name,
        lat: site.lat,
        lng: site.lng,
        radiusM: site.radiusM,
      });
      siteIds.set(site.key, s.id);
    }
    console.log(`Project: ${project.name} (${project.sites.length} sites)`);
  }

  // Oldest first, as a field team would upload them; copies always after their original.
  const ordered = [...DEMO_PHOTOS].sort(
    (a, b) =>
      Number(Boolean(a.copyOf)) - Number(Boolean(b.copyOf)) || (b.daysAgo ?? 0) - (a.daysAgo ?? 0),
  );
  const uploadedBytes = new Map<string, Buffer>();
  const assets = new Map<string, Asset>();
  for (const photo of ordered) {
    const bytes = photo.copyOf ? uploadedBytes.get(photo.copyOf)! : withDemoExif(photo);
    uploadedBytes.set(photo.file, bytes);
    const asset = await uploadPhoto(
      bytes,
      photo.file,
      projectIds.get(photo.project)!,
      photo.site && siteIds.get(photo.site),
    );
    assets.set(photo.file, asset);
    console.log(
      `  ${photo.file.padEnd(34)} ${photo.role.padEnd(16)} ${asset.trustBand} ${asset.trustScore}`,
    );
  }

  // The reused tank photo made the Phase 1 original suspicious too; the admin, who knows it's
  // theirs, approves it with a note. (The Phase 2 copy stays flagged.)
  const duplicate = DEMO_PHOTOS.find((p) => p.role === 'exact-duplicate')!;
  const original = assets.get(duplicate.copyOf!)!;
  const current = await api<Asset>('GET', `/assets/${original.id}`);
  if (current.trustBand !== 'verified') {
    await api('POST', `/assets/${original.id}/review`, {
      decision: 'approve',
      note: 'Our field team took this at Rampur when the tank was finished. Phase 2 reused it by mistake; that copy stays flagged.',
    });
    console.log(`Approved the original of the reused photo (${duplicate.copyOf})`);
  }

  const phase1 = DEMO_PROJECTS[0]!;
  const report = await api<{ id: string }>(
    'POST',
    `/projects/${projectIds.get(phase1.key)}/reports`,
    {
      periodStart: isoDay(phase1.startDaysAgo),
      periodEnd: isoDay(0),
    },
  );
  console.log(`Generating a report for ${phase1.name}…`);
  const done = await waitForReport(report.id);
  console.log(
    done.status === 'ready'
      ? `Report ready: ${done.claimCount} cited statements, ${done.droppedClaims} uncited removed`
      : `Report ${done.status}: ${done.error}`,
  );

  console.log(`\nDone. Sign in at ${baseUrl}/signin`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof SeedError ? `Seed failed: ${err.message}` : err);
  process.exit(1);
});
