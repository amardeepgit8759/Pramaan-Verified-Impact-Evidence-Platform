import {
  ANNEX_CSV_COLUMNS,
  reportListResponse,
  reportSummarySchema,
  type ReportDraft,
} from '@pramaan/shared';
import { parse } from 'csv-parse/sync';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { events, reportClaims, reports } from '../src/db/schema.js';
import { failInterruptedReports } from '../src/services/reports.js';
import { draftFromFacts } from './fakes.js';
import { resetDb } from './fixtures.js';
import { addMember, createTestApp, signUp } from './helpers.js';
import { binary, readPdf, upload, waitForReport } from './report-helpers.js';

const t = createTestApp();
afterAll(t.close);

let admin: Awaited<ReturnType<typeof signUp>>;
let project: { id: string; folder: string };

const PERIOD = { periodStart: '2024-01-01', periodEnd: '2024-12-31' };
const FEB = new Date('2024-02-01T09:00:00Z');
const JUN = new Date('2024-06-01T09:00:00Z');
const MISSING = '99999999-9999-4999-8999-999999999999';

beforeEach(async () => {
  await resetDb(t.db);
  t.media.resources.clear();
  t.ai.report = draftFromFacts;
  t.ai.reportGate = null;
  t.ai.reportFacts = [];
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

/** Two verified photos at the site, and one taken 41 km away (needs review, ineligible). */
async function seedEvidence() {
  const before = await upload(t, admin.agent, project, 'dry.jpg', { captured: FEB });
  const after = await upload(t, admin.agent, project, 'pump.jpg', { captured: JUN });
  const offSite = await upload(t, admin.agent, project, 'far.jpg', { captured: JUN, lat: 28.84 });
  expect([before.trustBand, after.trustBand, offSite.trustBand]).toEqual([
    'verified',
    'verified',
    'review',
  ]);
  return { before, after, offSite };
}

async function generate(body: object = PERIOD) {
  const res = await admin.agent.post(`/api/projects/${project.id}/reports`).send(body).expect(202);
  return reportSummarySchema.parse(res.body);
}

describe('POST /api/projects/:id/reports', () => {
  it('writes a report from eligible evidence only and drops uncited or ineligible claims', async () => {
    const { before, after, offSite } = await seedEvidence();
    t.ai.report = (): ReportDraft => ({
      summary: 'Two villages gained a hand pump.',
      sections: [
        {
          heading: 'Access to water',
          claims: [
            { sentence: 'A hand pump now stands at Village Rampur.', asset_ids: [after.id] },
            { sentence: 'The site was dry before.', asset_ids: [before.id, after.id] },
            { sentence: 'Pumps were installed elsewhere too.', asset_ids: [offSite.id] },
            { sentence: 'Every family now has water.', asset_ids: [] },
            { sentence: 'Made-up evidence.', asset_ids: [MISSING] },
          ],
        },
      ],
    });

    const started = await generate();
    expect(started).toMatchObject({ status: 'generating', claimCount: 0, generatedBy: 'Asha Rao' });

    const report = await waitForReport(admin.agent, started.id);
    expect(report).toMatchObject({
      status: 'ready',
      summary: 'Two villages gained a hand pump.',
      claimCount: 2,
      citedAssetCount: 2,
      droppedClaims: 3,
      projectName: 'Borewell Project',
      organisationName: 'Jal Seva Trust',
      sdgGoals: [6],
      error: null,
    });
    expect(report.sections).toEqual([
      {
        heading: 'Access to water',
        claims: [
          expect.objectContaining({ position: 0, assetIds: [after.id] }),
          expect.objectContaining({ position: 1, assetIds: [before.id, after.id] }),
        ],
      },
    ]);
    // The annex, in order of first citation, with each file's checks and citations.
    expect(report.evidence.map((e) => [e.ref, e.asset.id, e.citedIn])).toEqual([
      ['E1', after.id, [0, 1]],
      ['E2', before.id, [1]],
    ]);
    expect(report.evidence[0]!.checks).toHaveLength(6);
    expect(report.evidence[0]!.asset.uploadedBy).toBe('Asha Rao');

    // The model never saw the ineligible photo.
    const facts = t.ai.reportFacts[0]!;
    expect(JSON.stringify(facts)).not.toContain(offSite.id);
    expect(facts.totals.evidence).toBe(2);
    expect(facts.before_after).toEqual([
      expect.objectContaining({
        before: expect.objectContaining({ asset_id: before.id }),
        after: expect.objectContaining({ asset_id: after.id }),
      }),
    ]);

    const [event] = await t.db.select().from(events).where(eq(events.type, 'report.created'));
    expect(event!.payload).toMatchObject({
      reportId: started.id,
      status: 'ready',
      claims: 2,
      droppedClaims: 3,
    });
  });

  it('includes admin-approved evidence and tells the model it was approved', async () => {
    const { offSite } = await seedEvidence();
    await admin.agent
      .post(`/api/assets/${offSite.id}/review`)
      .send({ decision: 'approve', note: 'Second pump site, confirmed by phone' })
      .expect(200);
    t.ai.report = {
      summary: '',
      sections: [
        {
          heading: 'Approved',
          claims: [
            { sentence: 'A pump was photographed away from the site.', asset_ids: [offSite.id] },
          ],
        },
      ],
    };

    const report = await waitForReport(admin.agent, (await generate()).id);
    expect(report).toMatchObject({ status: 'ready', claimCount: 1, summary: null });
    expect(t.ai.reportFacts[0]!.assets.find((a) => a.id === offSite.id)).toMatchObject({
      approved_by_admin: true,
    });
    expect(report.evidence[0]!.reviews).toEqual([
      expect.objectContaining({ decision: 'approve', reviewerName: 'Asha Rao' }),
    ]);
  });

  it('only uses evidence from the period, by capture date', async () => {
    await seedEvidence();
    await waitForReport(
      admin.agent,
      (await generate({ periodStart: '2024-05-01', periodEnd: '2024-06-01' })).id,
    );
    expect(t.ai.reportFacts[0]!.totals.evidence).toBe(1);
  });

  it('refuses empty periods, bad periods, a second run at once and non-admins', async () => {
    await seedEvidence();
    const empty = await admin.agent
      .post(`/api/projects/${project.id}/reports`)
      .send({ periodStart: '2023-01-01', periodEnd: '2023-12-31' })
      .expect(422);
    expect(empty.body.error).toMatch(/no verified evidence from 1 Jan 2023 to 31 Dec 2023/);
    await admin.agent
      .post(`/api/projects/${project.id}/reports`)
      .send({ periodStart: '2024-12-31', periodEnd: '2024-01-01' })
      .expect(400);

    let release!: () => void;
    t.ai.reportGate = new Promise((resolve) => (release = resolve));
    const first = await generate();
    const busy = await admin.agent
      .post(`/api/projects/${project.id}/reports`)
      .send(PERIOD)
      .expect(409);
    expect(busy.body.error).toMatch(/already being generated/);
    release();
    expect((await waitForReport(admin.agent, first.id)).status).toBe('ready');
    await generate(); // free again

    const field = await addMember(t.app, admin.agent, 'field');
    await field.agent.post(`/api/projects/${project.id}/reports`).send(PERIOD).expect(403);
    const other = await signUp(t.app, 'Other NGO');
    await other.agent.post(`/api/projects/${project.id}/reports`).send(PERIOD).expect(404);
  });

  it('records a failure when the model errors or cites nothing usable', async () => {
    await seedEvidence();
    t.ai.report = new Error('RESOURCE_EXHAUSTED: quota');
    const failed = await waitForReport(admin.agent, (await generate()).id);
    expect(failed).toMatchObject({ status: 'failed', claimCount: 0 });
    expect(failed.error).toMatch(/couldn’t write this report/);
    expect(failed.error).not.toMatch(/quota/);

    t.ai.report = {
      summary: 'All good.',
      sections: [{ heading: 'x', claims: [{ sentence: 'Uncited.', asset_ids: [] }] }],
    };
    const empty = await waitForReport(admin.agent, (await generate()).id);
    expect(empty).toMatchObject({ status: 'failed', droppedClaims: 0 });
    expect(empty.error).toMatch(/None of the statements/);

    const failures = await t.db.select().from(events).where(eq(events.type, 'report.created'));
    expect(failures.map((e) => (e.payload as { status: string }).status)).toEqual([
      'failed',
      'failed',
    ]);
  });

  it('marks reports interrupted by a restart as failed', async () => {
    const [row] = await t.db
      .insert(reports)
      .values({ projectId: project.id, periodStart: '2024-01-01', periodEnd: '2024-12-31' })
      .returning();
    expect(await failInterruptedReports(t.db)).toBe(1);
    const report = await waitForReport(admin.agent, row!.id);
    expect(report).toMatchObject({ status: 'failed', error: expect.stringMatching(/restart/) });
  });
});

describe('reading, listing and deleting reports', () => {
  it('lists newest first with counts, lets viewers read, and keeps other organisations out', async () => {
    await seedEvidence();
    const a = await waitForReport(admin.agent, (await generate()).id);
    const b = await waitForReport(admin.agent, (await generate()).id);
    const viewer = await addMember(t.app, admin.agent, 'viewer');

    const list = reportListResponse.parse(
      (await viewer.agent.get(`/api/projects/${project.id}/reports`).expect(200)).body,
    );
    expect(list.reports.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(list.reports[0]).toMatchObject({ status: 'ready', claimCount: b.claimCount });
    await viewer.agent.get(`/api/reports/${a.id}`).expect(200);
    await viewer.agent.delete(`/api/reports/${a.id}`).expect(403);

    const other = await signUp(t.app, 'Other NGO');
    await other.agent.get(`/api/reports/${a.id}`).expect(404);
    await other.agent.get(`/api/reports/${a.id}/pdf`).expect(404);
    await admin.agent.get('/api/reports/not-a-uuid').expect(404);

    await admin.agent.delete(`/api/reports/${a.id}`).expect(204);
    await admin.agent.get(`/api/reports/${a.id}`).expect(404);
    expect(await t.db.select().from(reportClaims).where(eq(reportClaims.reportId, a.id))).toEqual(
      [],
    );
  });
});

describe('exports', () => {
  it('renders a non-empty PDF with the cover, cited sentences, thumbnails and annex', async () => {
    const { before, after } = await seedEvidence();
    const report = await waitForReport(admin.agent, (await generate()).id);

    const res = await admin.agent
      .get(`/api/reports/${report.id}/pdf`)
      .buffer(true)
      .parse(binary)
      .expect(200)
      .expect('Content-Type', 'application/pdf')
      .expect(
        'Content-Disposition',
        'attachment; filename="pramaan-report-borewell-project-2024-01-01_2024-12-31.pdf"',
      );
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5_000);

    const read = await readPdf(pdf);
    expect(read.title).toBe('Borewell Project: impact report, 1 Jan 2024 – 31 Dec 2024');
    expect(read.pages).toHaveLength(3);
    expect(read.pages[0]).toContain('Borewell Project Impact report · 1 Jan 2024 – 31 Dec 2024');
    expect(read.pages[0]).toContain('SDG 6 · Clean Water and Sanitation');
    expect(read.pages[0]).toContain('does not assert legal or regulatory compliance');
    expect(read.text).toContain('2 verified evidence files were captured at Village Rampur.');
    expect(read.text).toContain('[E1, E2]');
    expect(read.text).toContain('Evidence annex');
    expect(read.text).toContain(before.id);
    expect(read.text).toContain(after.id);
    expect(read.text).not.toContain('Every household'); // the dropped, uncited claim
    // Both sections cite both photos, so each shows both thumbnails; each still is fetched once.
    expect(read.images).toBe(4);
    expect(t.media.stillRequests).toHaveLength(2);
  });

  it('still renders when Cloudinary can’t supply thumbnails', async () => {
    await seedEvidence();
    const report = await waitForReport(admin.agent, (await generate()).id);
    t.media.still = null;
    const res = await admin.agent
      .get(`/api/reports/${report.id}/pdf`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    const read = await readPdf(res.body as Buffer);
    expect(read.images).toBe(0);
    expect(read.text).toContain('Image unavailable');
  });

  it('exports the evidence annex as CSV with the documented columns', async () => {
    const { before, after } = await seedEvidence();
    const report = await waitForReport(admin.agent, (await generate()).id);
    const res = await admin.agent
      .get(`/api/reports/${report.id}/annex.csv`)
      .expect(200)
      .expect('Content-Type', 'text/csv; charset=utf-8')
      .expect(
        'Content-Disposition',
        'attachment; filename="pramaan-report-borewell-project-2024-01-01_2024-12-31-evidence-annex.csv"',
      );
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    const rows = parse(res.text, { bom: true }) as string[][];
    expect(rows[0]).toEqual([...ANNEX_CSV_COLUMNS]);
    const records = parse(res.text, { bom: true, columns: true }) as Record<string, string>[];
    expect(records.map((r) => [r.evidence_ref, r.asset_id])).toEqual(
      report.evidence.map((e) => [e.ref, e.asset.id]),
    );
    expect(new Set(records.map((r) => r.asset_id))).toEqual(new Set([before.id, after.id]));
    expect(records[0]).toMatchObject({
      trust_score: '100',
      trust_band: 'verified',
      eligible_because: 'verified',
      checks_passed: '6/6',
      failed_checks: '',
      site: 'Village Rampur',
    });
  });

  it('only downloads finished reports', async () => {
    await seedEvidence();
    t.ai.report = new Error('down');
    const failed = await waitForReport(admin.agent, (await generate()).id);
    const res = await admin.agent.get(`/api/reports/${failed.id}/pdf`).expect(409);
    expect(res.body.error).toMatch(/isn’t ready/);
    await admin.agent.get(`/api/reports/${failed.id}/annex.csv`).expect(409);
  });
});
