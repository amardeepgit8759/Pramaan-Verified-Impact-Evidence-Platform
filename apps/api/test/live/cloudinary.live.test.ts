/**
 * Opt-in live test: `pnpm test:live`. Uploads a real image to Cloudinary exactly the way
 * the browser does (signed direct upload), checks what the server reads back, runs the
 * Gemini calls on it, then deletes it. Needs real keys in the root .env.
 */
import { randomUUID } from 'node:crypto';
import { EMBEDDING_DIMENSIONS, extractCaptureData, phashFromHex } from '@pramaan/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/env.js';
import { createLogger } from '../../src/logger.js';
import { GeminiAiClient } from '../../src/services/ai.js';
import { CloudinaryMediaStore, TaggingUnavailableError } from '../../src/services/media.js';
import { makeJpegWithExif } from '../sample-image.js';

const env = loadEnv({ ...process.env, LOG_LEVEL: 'warn', NODE_ENV: 'test' });
const media = new CloudinaryMediaStore(env, createLogger(env));
const ai = new GeminiAiClient(env);
const folder = `pramaan-test/${randomUUID()}`;
const uploaded: string[] = [];

afterAll(async () => {
  for (const publicId of uploaded) await media.destroy(publicId, 'image');
});

async function browserUpload(file: Buffer, filename: string) {
  const { uploadUrl, params } = await media.signUpload({
    folder,
    context: { pramaan_project_id: 'live-test' },
  });
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  form.append('file', new Blob([new Uint8Array(file)], { type: 'image/jpeg' }), filename);
  const res = await fetch(uploadUrl, { method: 'POST', body: form });
  const body = (await res.json()) as { public_id?: string; error?: { message: string } };
  if (!res.ok || !body.public_id) throw new Error(`Upload failed: ${body.error?.message}`);
  uploaded.push(body.public_id);
  return body.public_id;
}

describe('Cloudinary (live)', () => {
  it('uploads with a signature and reads back etag, pHash and EXIF', async () => {
    const file = makeJpegWithExif({ lat: 28.47, lng: 77.0301, capturedAt: '2024:03:10 09:00:00' });
    const publicId = await browserUpload(file, 'live-test.jpg');
    expect(publicId.startsWith(`${folder}/`)).toBe(true);

    const resource = await media.getResource(publicId, 'image');
    expect(resource).not.toBeNull();
    expect(resource!.etag).toMatch(/^[0-9a-f]{32}$/);
    expect(resource!.phash && phashFromHex(resource!.phash)).toMatch(/^[01]{64}$/);

    const capture = extractCaptureData(resource!.metadata);
    // Logged so the real metadata shape is visible when checking the parser against it.
    console.warn('media_metadata keys:', Object.keys((resource!.metadata as object) ?? {}));
    expect(capture.capturedAt?.toISOString()).toBe('2024-03-10T09:00:00.000Z');
    expect(capture.lat).toBeCloseTo(28.47, 3);
    expect(capture.lng).toBeCloseTo(77.0301, 3);
  });

  it('auto-tags with the add-on, or reports it as unavailable', async () => {
    const publicId = uploaded[0]!;
    try {
      const tags = await media.autoTag(publicId);
      expect(Array.isArray(tags)).toBe(true);
    } catch (err) {
      // Not enabled on this account: the pipeline falls back to Gemini, which is fine.
      expect(err).toBeInstanceOf(TaggingUnavailableError);
    }
  });

  it('builds delivery URLs Cloudinary actually serves', async () => {
    const res = await fetch(media.thumbnailUrl(uploaded[0]!, 'image'));
    expect(res.ok).toBe(true);
    expect(res.headers.get('content-type')).toMatch(/^image\//);
  });

  it('writes Pramaan context back to the asset', async () => {
    await media.writeBack(uploaded[0]!, 'image', { pramaan_trust_score: '100' });
  });
});

describe('Gemini (live)', () => {
  it('captions and tags the uploaded image with the configured model', async () => {
    const vision = await ai.describeImage(media.previewUrl(uploaded[0]!, 'image'));
    expect(vision.caption.length).toBeGreaterThan(0);
    expect(vision.tags.length).toBeGreaterThan(0);
  });

  it('embeds text at the stored dimension', async () => {
    const vector = await ai.embed('Women collecting water from a hand pump');
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
  });
});
