import { eventListResponse, liveEventSchema, metricsSchema } from '@pramaan/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { reports } from '../src/db/schema.js';
import { recordEvent } from '../src/services/events.js';
import { createAsset, resetDb } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { listen, openStream } from './sse-client.js';

const t = createTestApp();
let server: Awaited<ReturnType<typeof listen>>;
beforeAll(async () => {
  server = await listen(t.app);
});
afterAll(async () => {
  await server.close();
  await t.close();
});

/** Sign up and return the session cookie for raw fetch calls. */
async function session(orgName = 'Jal Seva Trust') {
  const email = `live+${Date.now()}-${Math.random()}@example.org`;
  const res = await request(t.app)
    .post('/api/auth/signup')
    .send({ orgName, name: 'Asha Rao', email, password: 'a strong password' })
    .expect(201);
  const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  const agent = request.agent(t.app);
  await agent.post('/api/auth/login').send({ email, password: 'a strong password' });
  return { cookie, agent, orgId: res.body.org.id as string, userId: res.body.user.id as string };
}

async function projectWithSite(agent: Awaited<ReturnType<typeof session>>['agent']) {
  const { body: project } = await agent
    .post('/api/projects')
    .send({ name: 'Borewell Project', startDate: '2024-01-01' })
    .expect(201);
  await agent
    .post(`/api/projects/${project.id}/sites`)
    .send({ name: 'Village Rampur', lat: 28.47, lng: 77.03, radiusM: 500 })
    .expect(201);
  return project as { id: string; name: string };
}

beforeEach(async () => {
  await resetDb(t.db);
  await t.live.init();
  t.media.resources.clear();
  t.media.autoTagResult = ['water pump'];
});

describe('GET /api/stream', () => {
  it('requires sign-in', async () => {
    const stream = await openStream(`${server.url}/api/stream`, {});
    expect(stream.status).toBe(401);
  });

  it('pushes asset.created when an upload is confirmed, and metrics change', async () => {
    const me = await session();
    const project = await projectWithSite(me.agent);
    const before = metricsSchema.parse((await me.agent.get('/api/metrics').expect(200)).body);
    expect(before.totalAssets).toBe(0);

    const stream = await openStream(`${server.url}/api/stream`, { Cookie: me.cookie });
    expect(stream.status).toBe(200);

    const publicId = `pramaan/${me.orgId}/${project.id}/pump.jpg`;
    t.media.addUpload({
      publicId,
      createdAt: new Date(),
      metadata: { GPSLatitude: '28.4701', GPSLongitude: '77.0301' },
    });
    await me.agent
      .post('/api/assets/confirm')
      .send({ publicId, projectId: project.id })
      .expect(201);

    const message = await stream.next((m) => m.event === 'asset.created');
    const event = liveEventSchema.parse(JSON.parse(message.data));
    expect(message.id).toBe(String(event.id));
    expect(event.payload).toMatchObject({
      projectName: 'Borewell Project',
      siteName: 'Village Rampur',
      actorId: me.userId,
      // GPS but no capture date: only missing_metadata fails (85, verified).
      band: 'verified',
      score: 85,
    });

    const after = metricsSchema.parse((await me.agent.get('/api/metrics').expect(200)).body);
    expect(after.totalAssets).toBe(1);
    expect(after.bands.verified).toBe(1);
    expect(after.uploadsPerDay.at(-1)?.count).toBe(1);
    stream.close();
  });

  it('replays missed events after Last-Event-ID, in order, and nothing earlier', async () => {
    const me = await session();
    const [first] = await recordEvent(t.db, me.orgId, 'settings.updated', { n: 1 });
    await recordEvent(t.db, me.orgId, 'settings.updated', { n: 2 });
    await recordEvent(t.db, me.orgId, 'settings.updated', { n: 3 });

    const stream = await openStream(`${server.url}/api/stream`, {
      Cookie: me.cookie,
      'Last-Event-ID': String(first!.id),
    });
    await stream.next((m) => m.data.includes('"n":3'));
    const replayed = stream.messages
      .filter((m) => m.event)
      .map((m) => JSON.parse(m.data).payload.n);
    expect(replayed).toEqual([2, 3]);
    stream.close();
  });

  it('sends heartbeats so proxies keep the connection open', async () => {
    const me = await session();
    const stream = await openStream(`${server.url}/api/stream`, { Cookie: me.cookie });
    await stream.next((m) => m.comment, 2000);
    stream.close();
  });

  it('only streams an organisation its own events', async () => {
    const a = await session('Org A');
    const b = await session('Org B');
    const streamB = await openStream(`${server.url}/api/stream`, { Cookie: b.cookie });
    await recordEvent(t.db, a.orgId, 'settings.updated', { secret: 'a' });
    await recordEvent(t.db, b.orgId, 'settings.updated', { mine: 'b' });
    t.live.poke();
    await streamB.next((m) => m.data.includes('"mine"'));
    expect(streamB.messages.some((m) => m.data.includes('secret'))).toBe(false);
    streamB.close();
  });
});

describe('GET /api/metrics', () => {
  it('computes every figure from the database, org-wide or per project', async () => {
    const me = await session();
    const project = await projectWithSite(me.agent);
    const other = (
      await me.agent.post('/api/projects').send({ name: 'Other', startDate: '2024-01-01' })
    ).body as { id: string };
    const now = new Date();
    const scope = { id: project.id, orgId: me.orgId };
    const { body: sites } = await me.agent.get(`/api/projects/${project.id}/sites`);
    const siteId = sites.sites[0].id as string;
    await createAsset(t.db, scope, {
      siteId,
      trustScore: 100,
      trustBand: 'verified',
      uploadedAt: now,
    });
    await createAsset(t.db, scope, {
      siteId,
      trustScore: 60,
      trustBand: 'review',
      uploadedAt: now,
    });
    await createAsset(t.db, scope, { trustScore: 20, trustBand: 'flagged', uploadedAt: now });
    await createAsset(
      t.db,
      { id: other.id, orgId: me.orgId },
      {
        trustScore: 30,
        trustBand: 'flagged',
        uploadedAt: new Date(now.getTime() - 20 * 86_400_000),
      },
    );
    await t.db.insert(reports).values({
      projectId: project.id,
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
      status: 'ready',
    });

    const org = metricsSchema.parse((await me.agent.get('/api/metrics').expect(200)).body);
    expect(org).toMatchObject({
      totalAssets: 4,
      verifiedPct: 25,
      bands: { verified: 1, review: 1, flagged: 2 },
      averageTrust: 52.5,
      flaggedLast7Days: 1,
      needsReview: 3,
      reportsGenerated: 1,
    });
    expect(org.uploadsPerDay).toHaveLength(30);
    expect(org.uploadsPerDay.at(-1)).toEqual({ date: now.toISOString().slice(0, 10), count: 3 });
    expect(org.bandsOverTime.at(-1)).toMatchObject({ verified: 1, review: 1, flagged: 1 });
    expect(org.assetsPerSite).toEqual([
      { siteId, siteName: 'Village Rampur', projectId: project.id, count: 2, verified: 1 },
    ]);
    // The site has recent verified evidence, so it's not a gap.
    expect(org.gapSites).toEqual([]);

    const scoped = metricsSchema.parse(
      (await me.agent.get(`/api/metrics?projectId=${project.id}`).expect(200)).body,
    );
    expect(scoped.totalAssets).toBe(3);

    const outsider = await session('Outsider');
    await outsider.agent.get(`/api/metrics?projectId=${project.id}`).expect(404);
  });

  it('reports documentation gaps for active projects', async () => {
    const me = await session();
    const project = await projectWithSite(me.agent);
    const metrics = metricsSchema.parse((await me.agent.get('/api/metrics').expect(200)).body);
    expect(metrics.gapSites).toEqual([
      expect.objectContaining({
        siteName: 'Village Rampur',
        projectName: project.name,
        daysSinceVerified: null,
        reason: 'No verified evidence yet',
      }),
    ]);
  });
});

describe('activity and review queue', () => {
  it('lists events newest first, with paging and project filter', async () => {
    const me = await session();
    const [p1, p2] = [randomUUID(), randomUUID()];
    for (const n of [1, 2, 3]) {
      await recordEvent(t.db, me.orgId, 'asset.created', { n, projectId: n === 2 ? p2 : p1 });
    }
    const all = eventListResponse.parse((await me.agent.get('/api/events?limit=2')).body).events;
    expect(all.map((e) => e.payload.n)).toEqual([3, 2]);
    const older = eventListResponse.parse(
      (await me.agent.get(`/api/events?before=${all[1]!.id}`)).body,
    ).events;
    expect(older.map((e) => e.payload.n)).toEqual([1]);
    const onlyP2 = eventListResponse.parse(
      (await me.agent.get(`/api/events?projectId=${p2}`)).body,
    );
    expect(onlyP2.events.map((e) => e.payload.n)).toEqual([2]);
    await me.agent.get('/api/events?projectId=not-a-uuid').expect(400);
  });

  it('queues review and flagged assets that have no decision, oldest first', async () => {
    const me = await session();
    const project = await projectWithSite(me.agent);
    const scope = { id: project.id, orgId: me.orgId };
    await createAsset(t.db, scope, { trustBand: 'verified' });
    const older = await createAsset(t.db, scope, {
      trustBand: 'flagged',
      trustScore: 20,
      uploadedAt: new Date('2024-01-01Z'),
    });
    const newer = await createAsset(t.db, scope, {
      trustBand: 'review',
      trustScore: 60,
      uploadedAt: new Date('2024-02-01Z'),
    });
    await createAsset(t.db, scope, { trustBand: 'flagged', reviewDecision: 'approve' });
    const res = await me.agent.get('/api/review-queue').expect(200);
    expect(res.body.assets.map((a: { id: string }) => a.id)).toEqual([older.id, newer.id]);
    expect(res.body.assets[0].projectName).toBe('Borewell Project');
  });
});
