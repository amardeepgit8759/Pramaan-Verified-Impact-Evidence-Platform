import { createRequire } from 'node:module';
import path from 'node:path';
import { reportDetailSchema, type ReportDetail } from '@pramaan/shared';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type request from 'supertest';
import type { createTestApp } from './helpers.js';

type Agent = ReturnType<typeof request.agent>;
type TestApp = ReturnType<typeof createTestApp>;

export const DAY = 86_400_000;

/** PDF.js reads the 14 standard PDF fonts' metrics from here. */
const STANDARD_FONTS = `${path
  .join(
    path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')),
    'standard_fonts',
  )
  .replaceAll(path.sep, '/')}/`;

/** EXIF for a photo taken at `captured`, at Village Rampur unless told otherwise. */
export const exifAt = (captured: Date, lat = 28.4702, lng = 77.0301) => ({
  DateTimeOriginal: captured.toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, ':'),
  GPSLatitude: String(lat),
  GPSLongitude: String(lng),
});

/** Confirm an upload through the real pipeline, with the (fake) vision result given. */
export async function upload(
  t: TestApp,
  agent: Agent,
  target: { id: string; folder: string },
  name: string,
  opts: { captured: Date; etag?: string; caption?: string; tags?: string[]; lat?: number },
) {
  t.ai.vision = {
    caption: opts.caption ?? 'A hand pump in a village',
    tags: opts.tags ?? ['water pump'],
  };
  const publicId = `${target.folder}/${name}`;
  t.media.addUpload({
    publicId,
    etag: opts.etag ?? name,
    metadata: exifAt(opts.captured, opts.lat),
    createdAt: new Date(opts.captured.getTime() + DAY),
  });
  const res = await agent
    .post('/api/assets/confirm')
    .send({ publicId, projectId: target.id })
    .expect(201);
  return res.body as { id: string; trustBand: string; trustScore: number };
}

/** Poll until a report has finished generating (it runs in the background). */
export async function waitForReport(agent: Agent, id: string): Promise<ReportDetail> {
  for (let i = 0; i < 200; i++) {
    const res = await agent.get(`/api/reports/${id}`).expect(200);
    if (res.body.status !== 'generating') return reportDetailSchema.parse(res.body);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Report ${id} was still generating`);
}

type Parser = Parameters<ReturnType<Agent['get']>['parse']>[0];

/** Supertest parser that keeps a binary body (a PDF) as a Buffer. */
export const binary = ((
  res: NodeJS.ReadableStream,
  done: (err: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
  res.on('error', (err: Error) => done(err, Buffer.alloc(0)));
}) as unknown as Parser;

/** Text, image count and metadata of a PDF, read with Mozilla's PDF.js. */
export async function readPdf(pdf: Buffer) {
  const task = getDocument({ data: new Uint8Array(pdf), standardFontDataUrl: STANDARD_FONTS });
  const doc = await task.promise;
  const pages: string[] = [];
  let images = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str + (item.hasEOL ? ' ' : '') : ''))
        .join('')
        .replace(/\s+/g, ' '),
    );
    const ops = await page.getOperatorList();
    images += ops.fnArray.filter((fn) => fn === OPS.paintImageXObject).length;
  }
  const info = (await doc.getMetadata()).info as { Title?: string };
  await task.destroy();
  return { pages, text: pages.join(' '), images, title: info.Title };
}
