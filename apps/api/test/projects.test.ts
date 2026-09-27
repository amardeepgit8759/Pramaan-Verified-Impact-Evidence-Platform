import { projectListResponse, projectSummarySchema, publicStatsSchema } from '@pramaan/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createAsset, createSite, resetDb } from './fixtures.js';
import { createTestApp } from './helpers.js';

const { app, db, close } = createTestApp();
afterAll(close);
beforeEach(() => resetDb(db));

async function signUp(email = 'admin@example.org', orgName = 'Jal Seva Trust') {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/signup')
    .send({ orgName, name: 'Admin', email, password: 'a strong password' })
    .expect(201);
  return { agent, orgId: res.body.org.id as string };
}

const borewell = {
  name: 'Borewell Project – Phase 1',
  description: 'Drinking water for three villages',
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  sdgGoals: [6, 3, 6],
  csrCategory: 'Water & sanitation',
};

describe('projects', () => {
  it('lets an admin create a project and returns live counts', async () => {
    const { agent } = await signUp();
    const res = await agent.post('/api/projects').send(borewell).expect(201);
    const project = projectSummarySchema.parse(res.body);
    expect(project).toMatchObject({
      name: 'Borewell Project – Phase 1',
      sdgGoals: [3, 6],
      status: 'active',
      siteCount: 0,
      assetCount: 0,
      bands: { verified: 0, review: 0, flagged: 0 },
      averageTrust: null,
    });
  });

  it('aggregates sites, assets per band and average trust', async () => {
    const { agent, orgId } = await signUp();
    const { body } = await agent.post('/api/projects').send(borewell);
    const project = { id: body.id as string, orgId };
    await createSite(db, project.id);
    await createAsset(db, project, { trustScore: 100, trustBand: 'verified' });
    await createAsset(db, project, { trustScore: 60, trustBand: 'review' });
    await createAsset(db, project, { trustScore: 25, trustBand: 'flagged' });

    const list = projectListResponse.parse((await agent.get('/api/projects').expect(200)).body);
    expect(list.projects[0]).toMatchObject({
      siteCount: 1,
      assetCount: 3,
      bands: { verified: 1, review: 1, flagged: 1 },
      averageTrust: 61.7,
    });
  });

  it('validates dates and SDG numbers', async () => {
    const { agent } = await signUp();
    const res = await agent
      .post('/api/projects')
      .send({ ...borewell, endDate: '2023-01-01', sdgGoals: [18] })
      .expect(400);
    const paths = res.body.details.map((d: { path: (string | number)[] }) => d.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['sdgGoals']));
  });

  it('keeps organizations apart', async () => {
    const a = await signUp('a@example.org', 'Org A');
    const b = await signUp('b@example.org', 'Org B');
    const { body } = await a.agent.post('/api/projects').send(borewell).expect(201);

    expect((await b.agent.get('/api/projects').expect(200)).body.projects).toEqual([]);
    await b.agent.get(`/api/projects/${body.id}`).expect(404);
    await a.agent.get(`/api/projects/${body.id}`).expect(200);
  });

  it('returns 404 for malformed ids and requires sign-in', async () => {
    const { agent } = await signUp();
    await agent.get('/api/projects/not-a-uuid').expect(404);
    await request(app).get('/api/projects').expect(401);
  });

  it('only lets admins create projects', async () => {
    const { agent } = await signUp();
    const invite = await agent
      .post('/api/users/invite')
      .send({ name: 'Viewer', email: 'viewer@example.org', role: 'viewer' });
    const token = new URL(invite.body.inviteUrl).searchParams.get('token');
    const viewer = request.agent(app);
    await viewer.post('/api/auth/set-password').send({ token, password: 'viewer password' });

    await viewer.post('/api/projects').send(borewell).expect(403);
    await viewer.get('/api/projects').expect(200);
  });
});

describe('public stats', () => {
  it('reports zeros on an empty platform', async () => {
    const res = await request(app).get('/api/public/stats').expect(200);
    expect(publicStatsSchema.parse(res.body)).toEqual({
      totalAssets: 0,
      verifiedAssets: 0,
      projects: 0,
      sites: 0,
      reports: 0,
    });
  });

  it('counts across organizations without revealing anything else', async () => {
    const { agent, orgId } = await signUp();
    const { body } = await agent.post('/api/projects').send(borewell);
    await createSite(db, body.id);
    await createAsset(db, { id: body.id, orgId }, { trustBand: 'verified' });
    await createAsset(db, { id: body.id, orgId }, { trustBand: 'flagged', trustScore: 20 });

    const res = await request(app).get('/api/public/stats').expect(200);
    expect(res.body).toEqual({
      totalAssets: 2,
      verifiedAssets: 1,
      projects: 1,
      sites: 1,
      reports: 0,
    });
  });
});
