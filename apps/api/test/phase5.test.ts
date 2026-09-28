import {
  compareResponse,
  DEFAULT_ORG_SETTINGS,
  searchResponse,
  searchSuggestionsResponse,
} from '@pramaan/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { events, sites } from '../src/db/schema.js';
import { refreshGaps } from '../src/services/gaps.js';
import { resetDb } from './fixtures.js';
import { createTestApp, signUp } from './helpers.js';

const t = createTestApp();
afterAll(t.close);

let admin: Awaited<ReturnType<typeof signUp>>;
let project: { id: string; folder: string };
let siteId: string;

const DAY = 86_400_000;
const exifAt = (captured: Date, lat = 28.4702, lng = 77.0301) => ({
  DateTimeOriginal: captured.toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, ':'),
  GPSLatitude: String(lat),
  GPSLongitude: String(lng),
});

async function createProject(name: string, startDate = '2020-01-01') {
  const res = await admin.agent.post('/api/projects').send({ name, startDate }).expect(201);
  return { id: res.body.id as string, folder: `pramaan/${admin.orgId}/${res.body.id}` };
}

/** Confirm an upload whose (fake) Gemini caption and tags are given. */
async function upload(
  name: string,
  vision: { caption: string; tags: string[] },
  opts: { captured?: Date; etag?: string; target?: typeof project; lat?: number } = {},
) {
  const target = opts.target ?? project;
  const captured = opts.captured ?? new Date(Date.now() - 2 * DAY);
  t.ai.vision = vision;
  const publicId = `${target.folder}/${name}`;
  t.media.addUpload({
    publicId,
    etag: opts.etag ?? name,
    metadata: exifAt(captured, opts.lat),
    createdAt: new Date(),
  });
  const res = await admin.agent
    .post('/api/assets/confirm')
    .send({ publicId, projectId: target.id })
    .expect(201);
  return res.body as { id: string; trustBand: string };
}

beforeEach(async () => {
  await resetDb(t.db);
  t.media.resources.clear();
  t.media.autoTagResult = [];
  t.ai.embedError = null;
  admin = await signUp(t.app);
  project = await createProject('Borewell Project');
  const res = await admin.agent
    .post(`/api/projects/${project.id}/sites`)
    .send({ name: 'Village Rampur', lat: 28.47, lng: 77.03, radiusM: 500 })
    .expect(201);
  siteId = res.body.id;
});

const PUMP = { caption: 'Women collecting water from a hand pump', tags: ['water pump', 'women'] };
const CLASS = { caption: 'Children reading in a classroom', tags: ['classroom', 'children'] };
const SOLAR = { caption: 'Solar panels on a school roof', tags: ['solar panel', 'roof'] };

describe('GET /api/search', () => {
  it('ranks the water pump photo first for "water pump"', async () => {
    const pump = await upload('pump.jpg', PUMP);
    await upload('class.jpg', CLASS);
    await upload('solar.jpg', SOLAR);

    const res = searchResponse.parse(
      (await admin.agent.get('/api/search?q=water%20pump').expect(200)).body,
    );
    expect(res.mode).toBe('semantic');
    expect(res.results[0]).toMatchObject({ match: 'semantic', asset: { id: pump.id } });
    const scores = res.results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(res.results[0]!.score).toBeGreaterThan(res.results[1]!.score);
  });

  it('applies filters: band, project and capture dates', async () => {
    await upload('pump.jpg', PUMP);
    const other = await createProject('School Build');
    const otherPump = await upload('pump2.jpg', PUMP, { target: other, etag: 'x' });

    const inOther = searchResponse.parse(
      (await admin.agent.get(`/api/search?q=pump&projectId=${other.id}`).expect(200)).body,
    );
    expect(inOther.results.map((r) => r.asset.id)).toEqual([otherPump.id]);

    const flagged = searchResponse.parse(
      (await admin.agent.get('/api/search?q=pump&band=flagged').expect(200)).body,
    );
    expect(flagged.results).toEqual([]);

    const future = searchResponse.parse(
      (await admin.agent.get('/api/search?q=pump&from=2099-01-01').expect(200)).body,
    );
    expect(future.results).toEqual([]);
  });

  it('falls back to keywords when the query can’t be embedded', async () => {
    const pump = await upload('pump.jpg', PUMP);
    await upload('class.jpg', CLASS);
    t.ai.embedError = new Error('Gemini unavailable');
    const res = searchResponse.parse((await admin.agent.get('/api/search?q=Water%20Pump')).body);
    expect(res.mode).toBe('keyword');
    expect(res.results).toEqual([
      expect.objectContaining({
        match: 'keyword',
        score: 1,
        asset: expect.objectContaining({ id: pump.id }),
      }),
    ]);
  });

  it('still finds assets whose embedding failed, by keyword', async () => {
    t.ai.embedError = new Error('embedding failed at upload');
    const pump = await upload('pump.jpg', PUMP);
    t.ai.embedError = null;
    await upload('class.jpg', CLASS);
    const res = searchResponse.parse((await admin.agent.get('/api/search?q=hand%20pump')).body);
    expect(res.mode).toBe('semantic');
    expect(res.results.find((r) => r.asset.id === pump.id)).toMatchObject({ match: 'keyword' });
  });

  it('suggests the organisation’s most-used tags', async () => {
    await upload('pump.jpg', PUMP);
    await upload('pump2.jpg', { caption: 'Another pump', tags: ['water pump'] });
    const res = searchSuggestionsResponse.parse(
      (await admin.agent.get('/api/search/suggestions')).body,
    );
    expect(res.tags[0]).toEqual({ tag: 'water pump', count: 2 });
  });

  it('validates the query and keeps other organisations out', async () => {
    await admin.agent.get('/api/search?q=').expect(400);
    const other = await signUp(t.app, 'Other NGO');
    await other.agent.get(`/api/search?q=pump&projectId=${project.id}`).expect(404);
    const theirs = searchResponse.parse((await other.agent.get('/api/search?q=pump')).body);
    expect(theirs.results).toEqual([]);
  });
});

describe('GET /api/sites/:id/compare', () => {
  it('suggests the earliest and latest verified photos and builds a composite', async () => {
    const now = Date.now();
    const first = await upload('first.jpg', PUMP, { captured: new Date(now - 60 * DAY) });
    await upload('middle.jpg', PUMP, { captured: new Date(now - 30 * DAY) });
    const last = await upload('last.jpg', PUMP, { captured: new Date(now - 2 * DAY) });

    const res = compareResponse.parse(
      (await admin.agent.get(`/api/sites/${siteId}/compare`).expect(200)).body,
    );
    expect(res.suggested).toBe(true);
    expect(res.before?.id).toBe(first.id);
    expect(res.after?.id).toBe(last.id);
    expect(res.candidates.map((c) => c.originalFilename)).toEqual(['photo', 'photo', 'photo']);
    expect(res.compositeUrl).toContain(`${project.folder}/first.jpg|${project.folder}/last.jpg`);
  });

  it('uses explicit picks from the same site, and refuses others', async () => {
    const a = await upload('a.jpg', PUMP, { captured: new Date(Date.now() - 10 * DAY) });
    const b = await upload('b.jpg', PUMP, { captured: new Date(Date.now() - 5 * DAY) });
    const res = compareResponse.parse(
      (await admin.agent.get(`/api/sites/${siteId}/compare?before=${b.id}&after=${a.id}`)).body,
    );
    expect(res).toMatchObject({ suggested: false, before: { id: b.id }, after: { id: a.id } });

    const other = await createProject('Other');
    const { body: otherSite } = await admin.agent
      .post(`/api/projects/${other.id}/sites`)
      .send({ name: 'Elsewhere', lat: 20, lng: 75, radiusM: 500 });
    await admin.agent.get(`/api/sites/${otherSite.id}/compare?before=${a.id}`).expect(404);
  });

  it('needs two verified photos to suggest a pair', async () => {
    await upload('only.jpg', PUMP);
    const res = compareResponse.parse((await admin.agent.get(`/api/sites/${siteId}/compare`)).body);
    expect(res).toMatchObject({ before: null, after: null, compositeUrl: null, suggested: false });
    expect(res.candidates).toHaveLength(1);
  });
});

describe('documentation-gap alerts', () => {
  async function gapEvents() {
    return (await t.db.select().from(events).where(eq(events.type, 'site.gap_changed'))).map(
      (e) => e.payload as { siteName: string; gap: boolean },
    );
  }
  const storedGap = async () =>
    (await t.db.select({ gap: sites.gap }).from(sites).where(eq(sites.id, siteId)))[0]!.gap;

  it('records a new site’s gap quietly, then announces when evidence closes it', async () => {
    expect(await storedGap()).toBe(true);
    expect(await gapEvents()).toEqual([]);

    await upload('pump.jpg', PUMP);
    expect(await storedGap()).toBe(false);
    expect(await gapEvents()).toEqual([
      expect.objectContaining({ siteName: 'Village Rampur', gap: false }),
    ]);
  });

  it('opens a gap when time passes without new verified evidence', async () => {
    await upload('pump.jpg', PUMP);
    const later = new Date(Date.now() + (DEFAULT_ORG_SETTINGS.gapDays + 5) * DAY);
    const changed = await refreshGaps(t.db, admin.orgId, later);
    expect(changed.map((c) => c.status.reason)).toEqual([
      `No verified evidence for ${DEFAULT_ORG_SETTINGS.gapDays + 7} days`,
    ]);
    expect((await gapEvents()).at(-1)).toMatchObject({ gap: true });
  });

  it('re-evaluates when the gap window changes in settings', async () => {
    // Verified evidence from 40 days ago: a gap under the default 30-day window.
    await upload('old.jpg', PUMP, { captured: new Date(Date.now() - 40 * DAY) });
    expect(await storedGap()).toBe(true);
    await admin.agent
      .put('/api/settings')
      .send({ ...DEFAULT_ORG_SETTINGS, gapDays: 60 })
      .expect(200);
    expect(await storedGap()).toBe(false);
    expect((await gapEvents()).at(-1)).toMatchObject({ gap: false });
  });

  it('clears gaps when a project is no longer active', async () => {
    await admin.agent
      .put(`/api/projects/${project.id}`)
      .send({ name: 'Borewell Project', startDate: '2020-01-01', status: 'completed' })
      .expect(200);
    expect(await storedGap()).toBe(false);
    expect((await gapEvents()).at(-1)).toMatchObject({ gap: false });
  });
});
