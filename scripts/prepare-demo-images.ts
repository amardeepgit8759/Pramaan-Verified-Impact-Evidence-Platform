/**
 * Fetch the demo photos from Wikimedia Commons into demo-data/ and write its README.
 * Run once (network needed); the results are committed, so seeding works offline.
 *
 *   pnpm demo:images
 *
 * Each photo is Commons' own scaled copy (a standard thumbnail width), with all metadata
 * removed: seed-demo.ts writes the demo capture date and GPS when it uploads. Only
 * licences that allow reuse with attribution are accepted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import piexif from 'piexifjs';
import { DEMO_PHOTOS, DEMO_PROJECTS, type DemoPhoto } from './demo-manifest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'demo-data');
const USER_AGENT =
  'PramaanDemoData/1.0 (https://github.com; demo dataset for an NGO evidence platform)';
const ALLOWED_LICENCE = /^(CC0|Public domain|CC BY(-SA)? \d\.\d)$/;

interface Source {
  file: string;
  title: string;
  page: string;
  author: string;
  licence: string;
  licenceUrl: string;
}

const stripTags = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

async function fetchPhoto(photo: DemoPhoto & { source: NonNullable<DemoPhoto['source']> }) {
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    titles: photo.source.title,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: String(photo.source.width),
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist',
  }).toString();
  const res = await fetch(api, { headers: { 'User-Agent': USER_AGENT } });
  const body = (await res.json()) as {
    query: {
      pages: Record<
        string,
        {
          imageinfo?: {
            thumburl: string;
            descriptionurl: string;
            extmetadata: Record<string, { value: string } | undefined>;
          }[];
        }
      >;
    };
  };
  const info = Object.values(body.query.pages)[0]?.imageinfo?.[0];
  if (!info) throw new Error(`Not found on Commons: ${photo.source.title}`);
  const licence = info.extmetadata.LicenseShortName?.value ?? '';
  if (!ALLOWED_LICENCE.test(licence)) {
    throw new Error(`${photo.source.title} has licence "${licence}", which isn't allowed`);
  }

  const image = await fetch(info.thumburl, { headers: { 'User-Agent': USER_AGENT } });
  if (!image.ok) throw new Error(`Download failed (${image.status}): ${info.thumburl}`);
  const bytes = Buffer.from(await image.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`Not a JPEG: ${info.thumburl}`);
  // Drop every original tag (camera, location, dates): the demo writes its own at seed time.
  const clean = Buffer.from(piexif.remove(bytes.toString('binary')), 'binary');
  fs.writeFileSync(path.join(outDir, photo.file), clean);

  return {
    file: photo.file,
    title: photo.source.title.replace(/^File:/, ''),
    page: info.descriptionurl,
    // Talk-page signatures end in "(talk) 09:37, 23 July 2009 (UTC)"; keep the name.
    author: stripTags(info.extmetadata.Artist?.value ?? 'Unknown').replace(/\s*\(talk\).*$/, ''),
    licence,
    licenceUrl: info.extmetadata.LicenseUrl?.value ?? '',
  } satisfies Source;
}

/** Half size (2×2 box average) and heavier compression: same picture, different file. */
function nearDuplicate(from: string, to: string) {
  const img = jpeg.decode(fs.readFileSync(path.join(outDir, from)), { useTArray: true });
  const w = Math.floor(img.width / 2);
  const h = Math.floor(img.height / 2);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ] as const) {
          sum += img.data[((2 * y + dy) * img.width + (2 * x + dx)) * 4 + c]!;
        }
        out[(y * w + x) * 4 + c] = Math.round(sum / 4);
      }
    }
  }
  fs.writeFileSync(path.join(outDir, to), jpeg.encode({ data: out, width: w, height: h }, 70).data);
}

function readme(sources: Source[]) {
  const bySource = new Map(sources.map((s) => [s.file, s]));
  const project = (key: string) => DEMO_PROJECTS.find((p) => p.key === key)!.name;
  const rows = DEMO_PHOTOS.map((p) => {
    const where = p.at ? `${p.at.lat.toFixed(4)}, ${p.at.lng.toFixed(4)}` : '—';
    const when = p.daysAgo === undefined ? '—' : `${p.daysAgo} days ago`;
    const file = p.copyOf ? `(same bytes as \`${p.copyOf}\`)` : `\`${p.file}\``;
    return `| ${file} | ${project(p.project)} | **${p.role}** | ${when} | ${where} | ${p.note} |`;
  });
  const credits = DEMO_PHOTOS.flatMap((p) => {
    const s = bySource.get(p.file);
    if (s)
      return [
        `- \`${s.file}\`: [${s.title}](${s.page}) by ${s.author}, ${s.licenceUrl ? `[${s.licence}](${s.licenceUrl})` : s.licence}.`,
      ];
    if (p.derivedFrom) {
      const base = bySource.get(p.derivedFrom)!;
      return [
        `- \`${p.file}\`: derived from \`${base.file}\` (scaled to half size and re-compressed), ${base.licence}.`,
      ];
    }
    return [];
  });

  return `# Demo data

Real photos for the demo organisation that \`pnpm seed:demo\` creates. The seed uploads them
through the same API and Cloudinary pipeline as the app. It inserts no scores, metrics or
reports directly: everything you see is computed by Pramaan from these files.

## How the demo metadata works

The photos come from Wikimedia Commons (credits below). All of their original metadata was
removed when they were downloaded. When seeding, \`seed-demo.ts\` writes a capture date and
GPS position into each file, **relative to the day you seed**, so the demo always looks like
an ongoing project. The dates and places are illustrative, not where the originals were
taken. \`sohna-03-no-metadata.jpg\` is uploaded without any metadata on purpose.

## What each file demonstrates

| File | Project | Role | Captured | GPS | What it shows |
| ---- | ------- | ---- | -------- | --- | ------------- |
${rows.join('\n')}

Planted problems, and what Pramaan should do with them:

- **Exact duplicate across projects:** \`bhondsi-03-reused-tank.jpg\` is uploaded with the same
  bytes as Phase 1's rainwater tank photo. Both are flagged (a reused photo makes the original
  suspicious too). The seed then has the admin approve the Phase 1 original with a note, which
  shows the review workflow.
- **Near-duplicate:** \`bhondsi-04-tank-resized.jpg\` is Phase 1's overhead tank photo at half
  size and heavier compression. The perceptual hash still matches it.
- **Off-site:** \`offsite-pump.jpg\` is geotagged about 41 km from the nearest project site.
- **No EXIF:** \`sohna-03-no-metadata.jpg\` has no date or location. It's scored "missing
  metadata", which means unverified, not fake.
- **Documentation gaps:** Village Damdama never gets evidence, and Village Bhondsi's newest
  verified photo is older than the 30-day gap window.

## Credits

${credits.join('\n')}

Photos under CC BY-SA are shared under the same licence, including the scaled-down copy.
To fetch them again: \`pnpm demo:images\`.
`;
}

fs.mkdirSync(outDir, { recursive: true });
const sources: Source[] = [];
for (const photo of DEMO_PHOTOS) {
  if (!photo.source) continue;
  const source = await fetchPhoto(
    photo as DemoPhoto & { source: NonNullable<DemoPhoto['source']> },
  );
  sources.push(source);
  console.log(`${source.file}  ${source.licence}  ${source.author}`);
}
for (const photo of DEMO_PHOTOS) {
  if (photo.derivedFrom) nearDuplicate(photo.derivedFrom, photo.file);
}
fs.writeFileSync(path.join(outDir, 'README.md'), readme(sources));
console.log(`Wrote ${sources.length} photos, derived copies and demo-data/README.md`);
