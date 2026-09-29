import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from './fixtures.js';
import { addMember, createTestApp, signUp } from './helpers.js';
import { upload } from './report-helpers.js';

// Tiny limits so the tests can reach them.
const t = createTestApp({ AI_RATE_LIMIT_MAX: '2', REPORT_RATE_LIMIT_MAX: '1' });
afterAll(t.close);
beforeEach(() => resetDb(t.db));

describe('limits on AI-backed endpoints', () => {
  it('limits searches per user, not for the whole organisation', async () => {
    const admin = await signUp(t.app);
    await admin.agent.get('/api/search?q=pump').expect(200);
    await admin.agent.get('/api/search?q=pump').expect(200);
    const limited = await admin.agent.get('/api/search?q=pump').expect(429);
    expect(limited.body.error).toMatch(/lot of AI requests/);
    expect(limited.headers['ratelimit-policy']).toBeDefined();

    // A teammate has their own allowance; non-AI endpoints are unaffected.
    const field = await addMember(t.app, admin.agent, 'field');
    await field.agent.get('/api/search?q=pump').expect(200);
    await admin.agent.get('/api/search/suggestions').expect(200);
  });

  it('counts upload confirmations, which caption and embed with Gemini', async () => {
    const admin = await signUp(t.app);
    const res = await admin.agent
      .post('/api/projects')
      .send({ name: 'Borewell Project', startDate: '2024-01-01' })
      .expect(201);
    const project = { id: res.body.id, folder: `pramaan/${admin.orgId}/${res.body.id}` };
    const captured = new Date('2024-03-10T09:00:00Z');
    await upload(t, admin.agent, project, 'a.jpg', { captured });
    await upload(t, admin.agent, project, 'b.jpg', { captured });
    t.media.addUpload({ publicId: `${project.folder}/c.jpg` });
    await admin.agent
      .post('/api/assets/confirm')
      .send({ publicId: `${project.folder}/c.jpg`, projectId: project.id })
      .expect(429);
  });

  it('limits report generation per organisation', async () => {
    const admin = await signUp(t.app);
    const res = await admin.agent
      .post('/api/projects')
      .send({ name: 'Borewell Project', startDate: '2024-01-01' })
      .expect(201);
    const reports = `/api/projects/${res.body.id}/reports`;
    const period = { periodStart: '2024-01-01', periodEnd: '2024-12-31' };
    // No evidence: refused, but the attempt still counts against the limit.
    await admin.agent.post(reports).send(period).expect(422);
    const limited = await admin.agent.post(reports).send(period).expect(429);
    expect(limited.body.error).toMatch(/generated a lot of reports/);
  });
});
