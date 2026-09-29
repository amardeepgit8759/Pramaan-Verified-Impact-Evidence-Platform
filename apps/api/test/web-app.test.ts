import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

// A stand-in for the built web app, with the metadata placeholder the real index.html uses.
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'pramaan-web-'));
fs.writeFileSync(
  path.join(dist, 'index.html'),
  '<html><head><meta property="og:image" content="__PUBLIC_ORIGIN__/og.png" /></head></html>',
);
fs.writeFileSync(path.join(dist, 'og.png'), 'png');
fs.mkdirSync(path.join(dist, 'assets'));
fs.writeFileSync(
  path.join(dist, 'assets', 'app-abc123.js'),
  'console.log("pramaan");\n'.repeat(400),
);

const t = createTestApp({ WEB_DIST_DIR: dist, PUBLIC_URL: 'https://pramaan.example.org/' });
afterAll(async () => {
  await t.close();
  fs.rmSync(dist, { recursive: true, force: true });
});

describe('serving the web app', () => {
  it('fills in absolute social-preview URLs and falls back to the app for client routes', async () => {
    const res = await request(t.app).get('/app/projects/123/reports').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.text).toContain('content="https://pramaan.example.org/og.png"');
    await request(t.app).get('/og.png').expect(200);
  });

  it('keeps funder share pages out of search engines', async () => {
    const res = await request(t.app).get('/share/abcdefghijklmnopqrstuvwxyz012345').expect(200);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    const home = await request(t.app).get('/').expect(200);
    expect(home.headers['x-robots-tag']).toBeUndefined();
  });

  it('compresses assets, which are cached for good because their names change', async () => {
    const res = await request(t.app)
      .get('/assets/app-abc123.js')
      .set('Accept-Encoding', 'gzip')
      .expect(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('never serves the app for unknown API routes', async () => {
    const res = await request(t.app).get('/api/nope').expect(404);
    expect(res.body.error).toMatch(/No route/);
  });
});
