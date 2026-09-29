import { healthResponseSchema } from '@pramaan/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

const { app, close } = createTestApp();
afterAll(close);

describe('GET /api/health', () => {
  it('reports a connected database with pgvector enabled', async () => {
    const res = await request(app).get('/api/health').expect(200);
    const body = healthResponseSchema.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.database).toMatchObject({ connected: true, pgvector: true });
    expect(body.database.latencyMs).toBeTypeOf('number');
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toContain('https://res.cloudinary.com');
    expect(res.headers['x-powered-by']).toBeUndefined();
    // Map tiles need a Referer; other sites get the origin only, never a share token path.
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });
});

describe('unknown API routes', () => {
  it('return a JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist').expect(404);
    expect(res.body.error).toBe('No route for GET /api/does-not-exist');
  });
});
