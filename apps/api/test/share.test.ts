import {
  reportDetailSchema,
  shareLinkListResponse,
  shareLinkSchema,
  sharedProjectSchema,
} from '@pramaan/shared';
import { count, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { assets, projects, reports, reviews, shareLinks, sites } from '../src/db/schema.js';
import { newShareToken } from '../src/services/share.js';
import { draftFromFacts } from './fakes.js';
import { resetDb } from './fixtures.js';
import { addMember, createTestApp, signUp } from './helpers.js';
import { binary, DAY, readPdf, upload, waitForReport } from './report-helpers.js';

const t = createTestApp();
afterAll(t.close);

let admin: Awaited<ReturnType<typeof signUp>>;
let project: { id: string; folder: string };

beforeEach(async () => {
  await resetDb(t.db);
  t.media.resources.clear();
  t.ai.report = draftFromFacts;
  t.ai.reportGate = null;
  admin = await signUp(t.app);
  const res = await admin.agent
    .post('/api/projects')
    .send({ name: 'Borewell Project', startDate: '2024-01-01', sdgGoals: [6] })
    .expect(201);
  project = { id: res.body.id, folder: `pramaan/${admin.orgId}/${res.body.id}` };
  await admin.agent
    .post(`/api/projects/${project.id}/sites`)
    .send({ name: 'Village Rampur', lat: 28.47, lng: 77.03, radiusM: 500 })
    .expect(201);
});

async function createLink(expiresInDays = 30) {
  const res = await admin.agent
    .post(`/api/projects/${project.id}/share-links`)
    .send({ expiresInDays })
    .expect(201);
  return shareLinkSchema.parse(res.body);
}

/** Anyone on the internet: no cookies. */
const publicClient = () => request(t.app);

describe('managing share links', () => {
  it('lets admins create, list and revoke links, and nobody else', async () => {
    const link = await createLink(7);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(link).toMatchObject({ expired: false, createdBy: 'Asha Rao' });
    const days = (new Date(link.expiresAt).getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);

    const list = shareLinkListResponse.parse(
      (await admin.agent.get(`/api/projects/${project.id}/share-links`).expect(200)).body,
    );
    expect(list.links.map((l) => l.id)).toEqual([link.id]);

    const field = await addMember(t.app, admin.agent, 'field');
    await field.agent.get(`/api/projects/${project.id}/share-links`).expect(403);
    await field.agent.post(`/api/projects/${project.id}/share-links`).send({}).expect(403);
    await field.agent.delete(`/api/share-links/${link.id}`).expect(403);
    const other = await signUp(t.app, 'Other NGO');
    await other.agent.delete(`/api/share-links/${link.id}`).expect(404);
    await admin.agent
      .post(`/api/projects/${project.id}/share-links`)
      .send({ expiresInDays: 365 })
      .expect(400);

    await admin.agent.delete(`/api/share-links/${link.id}`).expect(204);
    await publicClient().get(`/api/share/${link.token}`).expect(404);
  });
});

describe('the public share view', () => {
  it('shows eligible evidence, sites, metrics and ready reports, without uploader names', async () => {
    const pump = await upload(t, admin.agent, project, 'pump.jpg', {
      captured: new Date('2024-06-01T09:00:00Z'),
    });
    const far = await upload(t, admin.agent, project, 'far.jpg', {
      captured: new Date('2024-06-01T09:00:00Z'),
      lat: 28.84,
    });
    expect(far.trustBand).toBe('review');
    const report = await waitForReport(
      admin.agent,
      (
        await admin.agent
          .post(`/api/projects/${project.id}/reports`)
          .send({ periodStart: '2024-01-01', periodEnd: '2024-12-31' })
          .expect(202)
      ).body.id,
    );
    const link = await createLink();

    const res = await publicClient()
      .get(`/api/share/${link.token}`)
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect('X-Robots-Tag', 'noindex, nofollow');
    const shared = sharedProjectSchema.parse(res.body);
    expect(shared).toMatchObject({
      organisationName: 'Jal Seva Trust',
      project: { id: project.id, name: 'Borewell Project', sdgGoals: [6] },
      metrics: {
        evidence: 1,
        sites: 1,
        sitesWithEvidence: 1,
        averageTrust: 100,
        verifiedPct: 50,
        reports: 1,
        lastEvidenceAt: '2024-06-01T09:00:00.000Z',
      },
    });
    expect(shared.evidence.map((e) => e.asset.id)).toEqual([pump.id]);
    expect(shared.evidence[0]!.asset.uploadedBy).toBeNull();
    expect(shared.evidence[0]!.checks).toHaveLength(6);
    expect(shared.sites).toEqual([
      expect.objectContaining({ name: 'Village Rampur', assetCount: 1 }),
    ]);
    expect(shared.reports.map((r) => r.id)).toEqual([report.id]);

    const detail = reportDetailSchema.parse(
      (await publicClient().get(`/api/share/${link.token}/reports/${report.id}`).expect(200)).body,
    );
    expect(detail.evidence[0]!.asset.uploadedBy).toBeNull();

    const pdf = await publicClient()
      .get(`/api/share/${link.token}/reports/${report.id}/pdf`)
      .buffer(true)
      .parse(binary)
      .expect(200)
      .expect('Content-Type', 'application/pdf');
    expect((await readPdf(pdf.body as Buffer)).text).toContain('Evidence annex');
    const csv = await publicClient()
      .get(`/api/share/${link.token}/reports/${report.id}/annex.csv`)
      .expect(200);
    expect(csv.text).toContain(pump.id);
  });

  it('only opens this project’s finished reports', async () => {
    await upload(t, admin.agent, project, 'pump.jpg', {
      captured: new Date('2024-06-01T09:00:00Z'),
    });
    let release!: () => void;
    t.ai.reportGate = new Promise((resolve) => (release = resolve));
    const generating = await admin.agent
      .post(`/api/projects/${project.id}/reports`)
      .send({ periodStart: '2024-01-01', periodEnd: '2024-12-31' })
      .expect(202);
    const link = await createLink();
    await publicClient().get(`/api/share/${link.token}/reports/${generating.body.id}`).expect(404);
    release();
    await waitForReport(admin.agent, generating.body.id);

    // A report from another project in the same organisation isn't reachable via this link.
    const other = await admin.agent
      .post('/api/projects')
      .send({ name: 'School Build', startDate: '2024-01-01' })
      .expect(201);
    const [otherReport] = await t.db
      .insert(reports)
      .values({
        projectId: other.body.id,
        periodStart: '2024-01-01',
        periodEnd: '2024-12-31',
        status: 'ready',
      })
      .returning();
    await publicClient().get(`/api/share/${link.token}/reports/${otherReport!.id}`).expect(404);
    await publicClient().get(`/api/share/${link.token}/reports/not-a-uuid`).expect(404);
  });

  it('expires: 410 after the expiry time, 404 for unknown tokens', async () => {
    const link = await createLink();
    await publicClient().get(`/api/share/${link.token}`).expect(200);
    await t.db
      .update(shareLinks)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(shareLinks.id, link.id));
    const res = await publicClient().get(`/api/share/${link.token}`).expect(410);
    expect(res.body.error).toMatch(/expired/);
    await publicClient().get(`/api/share/${link.token}/reports/${link.id}`).expect(410);

    const listed = shareLinkListResponse.parse(
      (await admin.agent.get(`/api/projects/${project.id}/share-links`)).body,
    );
    expect(listed.links[0]!.expired).toBe(true);

    await publicClient().get(`/api/share/${newShareToken()}`).expect(404);
    await publicClient().get('/api/share/short').expect(404);
  });

  it('cannot change anything, and grants nothing outside the share view', async () => {
    const pump = await upload(t, admin.agent, project, 'pump.jpg', {
      captured: new Date('2024-06-01T09:00:00Z'),
    });
    const link = await createLink();
    const snapshot = async () =>
      Promise.all(
        [projects, sites, assets, reviews, reports, shareLinks].map(
          async (table) => (await t.db.select({ n: count() }).from(table))[0]!.n,
        ),
      );
    const before = await snapshot();
    const base = `/api/share/${link.token}`;

    for (const [method, path] of [
      ['post', base],
      ['put', base],
      ['patch', base],
      ['delete', base],
      ['post', `${base}/reports`],
      ['delete', `${base}/reports/${pump.id}`],
      ['post', `${base}/assets/${pump.id}/review`],
    ] as const) {
      const res = await publicClient()[method](path).send({ decision: 'reject', note: 'x' });
      expect(res.status, `${method} ${path}`).toBe(405);
      expect(res.headers.allow).toBe('GET, HEAD');
    }
    // The token is not a session: the app's own API still needs sign-in.
    await publicClient().get(`/api/projects/${project.id}`).expect(401);
    await publicClient().post(`/api/assets/${pump.id}/review`).send({}).expect(401);
    await publicClient()
      .get(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${link.token}`)
      .expect(401);

    expect(await snapshot()).toEqual(before);
  });
});
