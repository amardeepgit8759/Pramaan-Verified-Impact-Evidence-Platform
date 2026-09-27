import {
  assetDetailSchema,
  assetListResponse,
  phashFromHex,
  uploadSignatureResponse,
  type AssetDetail,
} from '@pramaan/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { assets, events } from '../src/db/schema.js';
import { resetDb } from './fixtures.js';
import { addMember, createTestApp, signUp } from './helpers.js';

const t = createTestApp();
const { app, db, media, ai } = t;
afterAll(t.close);

const HASH = 'ba19c8ab5fa05a59';
/** A pHash that differs from HASH in 3 bits. */
const NEAR_HASH = (BigInt(`0x${HASH}`) ^ 0b111n).toString(16).padStart(16, '0');

/** EXIF as Cloudinary returns it: inside the project dates, at Village Rampur. */
const goodExif = {
  DateTimeOriginal: '2024:03:10 09:00:00',
  GPSLatitude: `28 deg 28' 12.00"`,
  GPSLatitudeRef: 'North',
  GPSLongitude: `77 deg 1' 48.00"`,
  GPSLongitudeRef: 'East',
};

let admin: Awaited<ReturnType<typeof signUp>>;
let project: { id: string; folder: string };
let site: { id: string };

beforeEach(async () => {
  await resetDb(db);
  media.resources.clear();
  media.writeBacks = [];
  media.autoTagResult = ['water pump', 'village'];
  ai.vision = {
    caption: 'Women collecting water from a hand pump.',
    tags: ['water pump', 'women'],
  };
  ai.embedError = null;

  admin = await signUp(app);
  project = await createProject('Borewell Project – Phase 2');
  const res = await admin.agent
    .post(`/api/projects/${project.id}/sites`)
    .send({ name: 'Village Rampur', lat: 28.47, lng: 77.03, radiusM: 500 })
    .expect(201);
  site = res.body;
});

async function createProject(name: string) {
  const res = await admin.agent
    .post('/api/projects')
    .send({ name, startDate: '2024-01-01', endDate: '2024-12-31' })
    .expect(201);
  return { id: res.body.id as string, folder: `pramaan/${admin.orgId}/${res.body.id}` };
}

/** Fake a finished browser upload, then confirm it through the API. */
async function upload(
  name: string,
  resource: Partial<Parameters<typeof media.addUpload>[0]> = {},
  opts: { project?: typeof project; siteId?: string; expect?: number } = {},
): Promise<AssetDetail> {
  const target = opts.project ?? project;
  const publicId = `${target.folder}/${name}`;
  media.addUpload({
    publicId,
    metadata: goodExif,
    createdAt: new Date('2024-03-11T09:00:00Z'),
    ...resource,
  });
  const res = await admin.agent
    .post('/api/assets/confirm')
    .send({ publicId, projectId: target.id, siteId: opts.siteId })
    .expect(opts.expect ?? 201);
  return assetDetailSchema.parse(res.body);
}

const checkOf = (asset: AssetDetail, type: AssetDetail['checks'][number]['type']) =>
  asset.checks.find((c) => c.type === type)!;

async function eventTypes() {
  return (await db.select().from(events).where(eq(events.orgId, admin.orgId))).map((e) => e.type);
}

describe('POST /api/uploads/signature', () => {
  it('signs an upload into the project’s folder with its context', async () => {
    const res = await admin.agent
      .post('/api/uploads/signature')
      .send({ projectId: project.id, siteId: site.id })
      .expect(200);
    expect(uploadSignatureResponse.parse(res.body).uploadUrl).toMatch(/\/auto\/upload$/);
    expect(media.signed.at(-1)).toEqual({
      folder: project.folder,
      context: {
        pramaan_org_id: admin.orgId,
        pramaan_project_id: project.id,
        pramaan_site_id: site.id,
        pramaan_uploaded_by: admin.userId,
      },
    });
  });

  it('lets field staff upload but not viewers, and only to their own projects', async () => {
    const field = await addMember(app, admin.agent, 'field');
    await field.agent.post('/api/uploads/signature').send({ projectId: project.id }).expect(200);
    const viewer = await addMember(app, admin.agent, 'viewer');
    await viewer.agent.post('/api/uploads/signature').send({ projectId: project.id }).expect(403);
    const other = await signUp(app, 'Other NGO');
    await other.agent.post('/api/uploads/signature').send({ projectId: project.id }).expect(404);
  });
});

describe('POST /api/assets/confirm', () => {
  it('re-fetches the file, reads EXIF, tags, embeds, auto-assigns the site and scores it', async () => {
    const asset = await upload('pump.jpg', { phash: HASH });
    expect(asset).toMatchObject({
      siteId: site.id,
      siteName: 'Village Rampur',
      uploadedBy: 'Asha Rao',
      tags: ['water pump', 'village'],
      taggingProvider: 'cloudinary',
      caption: null,
      capturedAt: '2024-03-10T09:00:00.000Z',
      uploadedAt: '2024-03-11T09:00:00.000Z',
      trustScore: 100,
      trustBand: 'verified',
    });
    expect(asset.lat).toBeCloseTo(28.47, 3);
    expect(asset.checks).toHaveLength(6);
    expect(asset.checks.every((c) => c.passed)).toBe(true);
    expect(asset.exif).toMatchObject({ DateTimeOriginal: '2024:03:10 09:00:00' });

    const [row] = await db.select().from(assets).where(eq(assets.id, asset.id));
    expect(row!.phash).toBe(phashFromHex(HASH));
    expect(row!.embedding).toHaveLength(768);
    expect(ai.embeddedTexts.at(-1)).toContain('Site: Village Rampur');
    expect(await eventTypes()).toContain('asset.created');
    expect(media.writeBacks.at(-1)?.context).toMatchObject({
      pramaan_project_id: project.id,
      pramaan_site_id: site.id,
      pramaan_trust_score: '100',
    });
  });

  it('falls back to Gemini when the Cloudinary add-on is unavailable', async () => {
    media.autoTagResult = new Error('google_tagging is not enabled for this account');
    const asset = await upload('pump.jpg');
    expect(asset).toMatchObject({
      taggingProvider: 'gemini',
      caption: 'Women collecting water from a hand pump.',
      tags: ['water pump', 'women'],
    });
    expect(ai.describedUrls.at(-1)).toContain('pump.jpg');
  });

  it('falls back to Gemini when the add-on finds no tags', async () => {
    media.autoTagResult = [];
    expect((await upload('pump.jpg')).taggingProvider).toBe('gemini');
  });

  it('uses Gemini directly when TAGGING_PROVIDER=gemini', async () => {
    const g = createTestApp({ TAGGING_PROVIDER: 'gemini' });
    try {
      const agent = (await signUp(g.app)).agent;
      const { body: p } = await agent
        .post('/api/projects')
        .send({ name: 'P', startDate: '2024-01-01' });
      const me = (await agent.get('/api/auth/me')).body;
      const publicId = `pramaan/${me.org.id}/${p.id}/x.jpg`;
      g.media.autoTagResult = ['should not be used'];
      g.media.addUpload({ publicId });
      const res = await agent
        .post('/api/assets/confirm')
        .send({ publicId, projectId: p.id })
        .expect(201);
      expect(res.body.taggingProvider).toBe('gemini');
    } finally {
      await g.close();
    }
  });

  it('still stores the asset when tagging and embedding both fail', async () => {
    media.autoTagResult = new Error('quota exceeded');
    ai.vision = new Error('Gemini unavailable');
    ai.embedError = new Error('embedding failed');
    const asset = await upload('pump.jpg');
    expect(asset).toMatchObject({ taggingProvider: 'none', tags: [], trustBand: 'verified' });
    const [row] = await db.select().from(assets).where(eq(assets.id, asset.id));
    expect(row!.embedding).toBeNull();
  });

  it('calls a photo without EXIF unverified, not fake', async () => {
    const asset = await upload('no-exif.jpg', { metadata: {} });
    expect(asset).toMatchObject({ siteId: null, capturedAt: null, lat: null, trustScore: 85 });
    expect(checkOf(asset, 'missing_metadata').reason).toBe(
      'No GPS location or capture date in the file: unverified, not necessarily fake',
    );
  });

  it('flags a photo taken far from the chosen site', async () => {
    const asset = await upload(
      'far.jpg',
      { metadata: { ...goodExif, GPSLatitude: '28.84', GPSLatitudeRef: 'N' } },
      { siteId: site.id },
    );
    expect(checkOf(asset, 'wrong_location')).toMatchObject({ passed: false, deduction: 40 });
    expect(checkOf(asset, 'wrong_location').reason).toMatch(/^Taken 41\.\d km from Village Rampur/);
    expect(asset.trustBand).toBe('review');
  });

  it('flags an exact copy across projects and re-scores the earlier upload too', async () => {
    const original = await upload('original.jpg', { etag: 'same-file' });
    const phase1 = await createProject('Borewell Project – Phase 1');
    const copy = await upload('copy.jpg', { etag: 'same-file' }, { project: phase1 });

    expect(checkOf(copy, 'exact_duplicate').reason).toBe(
      'Exact copy of an asset in Borewell Project – Phase 2',
    );
    expect(copy.trustBand).toBe('flagged');

    const earlier = assetDetailSchema.parse(
      (await admin.agent.get(`/api/assets/${original.id}`).expect(200)).body,
    );
    expect(checkOf(earlier, 'exact_duplicate').reason).toBe(
      'Exact copy of an asset in Borewell Project – Phase 1',
    );
    expect(earlier.trustBand).toBe('flagged');
    expect(await eventTypes()).toEqual(
      expect.arrayContaining(['asset.created', 'asset.created', 'asset.rescored']),
    );
  });

  it('flags a near-copy (resized or re-saved) in another project', async () => {
    await upload('original.jpg', { phash: HASH });
    const other = await createProject('School Sanitation');
    const resized = await upload('resized.jpg', { phash: NEAR_HASH }, { project: other });
    expect(checkOf(resized, 'near_duplicate').reason).toBe(
      'Near-copy of an asset in Borewell Project – Phase 2 (distance 3/64)',
    );
  });

  it('is idempotent: confirming the same upload twice returns the same asset', async () => {
    const first = await upload('pump.jpg');
    const again = await admin.agent
      .post('/api/assets/confirm')
      .send({ publicId: `${project.folder}/pump.jpg`, projectId: project.id })
      .expect(200);
    expect(again.body.id).toBe(first.id);
    const [{ count }] = (await db.execute<{ count: number }>(sql`select count(*)::int from assets`))
      .rows as [{ count: number }];
    expect(count).toBe(1);
  });

  it('refuses uploads outside the project folder, unknown files and viewers', async () => {
    const other = await createProject('Other project');
    media.addUpload({ publicId: `${other.folder}/sneaky.jpg` });
    const wrongFolder = await admin.agent
      .post('/api/assets/confirm')
      .send({ publicId: `${other.folder}/sneaky.jpg`, projectId: project.id })
      .expect(400);
    expect(wrongFolder.body.error).toMatch(/doesn’t belong to this project/);

    await admin.agent
      .post('/api/assets/confirm')
      .send({ publicId: `${project.folder}/missing.jpg`, projectId: project.id })
      .expect(404);

    const viewer = await addMember(app, admin.agent, 'viewer');
    await viewer.agent
      .post('/api/assets/confirm')
      .send({ publicId: `${project.folder}/x.jpg`, projectId: project.id })
      .expect(403);
  });

  it('rejects a site from a different project', async () => {
    const other = await createProject('Other project');
    const { body: otherSite } = await admin.agent
      .post(`/api/projects/${other.id}/sites`)
      .send({ name: 'Elsewhere', lat: 20, lng: 75, radiusM: 500 });
    media.addUpload({ publicId: `${project.folder}/x.jpg` });
    await admin.agent
      .post('/api/assets/confirm')
      .send({ publicId: `${project.folder}/x.jpg`, projectId: project.id, siteId: otherSite.id })
      .expect(404);
  });
});

describe('reading evidence', () => {
  it('keeps each organisation’s evidence private', async () => {
    const asset = await upload('pump.jpg');
    const other = await signUp(app, 'Other NGO');
    await other.agent.get(`/api/assets/${asset.id}`).expect(404);
    await other.agent.get(`/api/projects/${project.id}/assets`).expect(404);
    await admin.agent.get('/api/assets/not-a-uuid').expect(404);
  });

  it('lists a project’s evidence with filters', async () => {
    await upload('pump.jpg');
    await upload('no-exif.jpg', { metadata: {}, etag: 'other' });
    const list = async (query: string) =>
      assetListResponse
        .parse(
          (await admin.agent.get(`/api/projects/${project.id}/assets${query}`).expect(200)).body,
        )
        .assets.map((a) => a.originalFilename && a.id);

    expect(await list('')).toHaveLength(2);
    expect(await list(`?siteId=${site.id}`)).toHaveLength(1);
    expect(await list('?band=verified')).toHaveLength(2);
    expect(await list('?tag=water%20pump')).toHaveLength(2);
    expect(await list('?tag=elephant')).toHaveLength(0);
    expect(await list('?from=2024-03-10&to=2024-03-10')).toHaveLength(1);
    expect(await list('?from=2024-03-11')).toHaveLength(0);
    await admin.agent.get(`/api/projects/${project.id}/assets?band=purple`).expect(400);
  });
});
