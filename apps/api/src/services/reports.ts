import {
  buildReportFacts,
  CHECK_TYPES,
  evidenceOrder,
  formatDay,
  reportInput,
  validateReportDraft,
  type DropReason,
  type ReportDetail,
  type ReportEvidence,
  type ReportSection,
  type ReportSummary,
  type ReviewDecision,
} from '@pramaan/shared';
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { isUniqueViolation } from '../db/errors.js';
import {
  assets,
  organizations,
  projects,
  reportClaims,
  reports,
  reviews,
  sites,
  trustChecks,
  users,
} from '../db/schema.js';
import type { SessionUser } from '../auth/session.js';
import { HttpError } from '../http-error.js';
import type { Logger } from '../logger.js';
import { requireProject } from './access.js';
import type { AiClient } from './ai.js';
import { listAssetRows } from './asset-views.js';
import { recordEvent } from './events.js';
import type { MediaStore } from './media.js';
import { assetsShownInPdf, renderReportPdf } from './report-pdf.js';

const STILL_CONCURRENCY = 6;

export interface ReportDeps {
  db: Db;
  ai: AiClient;
  media: MediaStore;
  logger: Logger;
  /** Streams the report.created event once generation finishes in the background. */
  live: { poke(): void };
}

/** "Counts as verified evidence" (mirrors isReportEligible), for queries on `assets`. */
export const eligibleAsset = sql`((${assets.trustBand} = 'verified' and ${assets.reviewDecision} is distinct from 'reject') or ${assets.reviewDecision} = 'approve')`;

/** Evidence belongs to the day it was captured, or uploaded when the capture time is unknown. */
const evidenceTime = sql`coalesce(${assets.capturedAt}, ${assets.uploadedAt})`;

function inPeriod(start: string, end: string): SQL {
  const endExclusive = new Date(`${end}T00:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return sql`${evidenceTime} >= ${`${start}T00:00:00Z`}::timestamptz and ${evidenceTime} < ${endExclusive.toISOString()}::timestamptz`;
}

/** A failure whose message is safe and useful to show to the user as-is. */
class ReportFailure extends Error {}

const GENERIC_FAILURE = 'The AI model couldn’t write this report just now. Try again in a minute.';

async function eligibleEvidence(db: Db, projectId: string, start: string, end: string) {
  return db
    .select({
      id: assets.id,
      siteName: sites.name,
      resourceType: assets.resourceType,
      capturedAt: assets.capturedAt,
      uploadedAt: assets.uploadedAt,
      caption: assets.caption,
      tags: assets.tags,
      trustScore: assets.trustScore,
      reviewDecision: assets.reviewDecision,
    })
    .from(assets)
    .leftJoin(sites, eq(sites.id, assets.siteId))
    .where(and(eq(assets.projectId, projectId), eligibleAsset, inPeriod(start, end)));
}

/**
 * Start generating a report. Checks and creates the row synchronously (so the caller gets
 * 202 with a "generating" report), then writes it in the background: the model sees only
 * facts built from eligible evidence, and only claims citing that evidence are kept.
 */
export async function startReport(
  deps: ReportDeps,
  actor: SessionUser,
  projectId: unknown,
  body: unknown,
) {
  const { db } = deps;
  const project = await requireProject(db, actor.orgId, projectId);
  const period = reportInput.parse(body);
  const evidence = await eligibleEvidence(db, project.id, period.periodStart, period.periodEnd);
  if (evidence.length === 0) {
    const from = formatDay(new Date(`${period.periodStart}T00:00:00Z`));
    const to = formatDay(new Date(`${period.periodEnd}T00:00:00Z`));
    throw new HttpError(
      422,
      `There’s no verified evidence from ${from} to ${to}. Pick a period with verified evidence.`,
    );
  }

  let created: typeof reports.$inferSelect;
  try {
    [created] = (await db
      .insert(reports)
      .values({
        projectId: project.id,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        generatedBy: actor.id,
      })
      .returning()) as [typeof reports.$inferSelect];
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new HttpError(409, 'A report for this project is already being generated.');
    }
    throw err;
  }

  const done = writeReport(deps, actor, project, created.id, period, evidence);
  const [summary] = await reportSummaries(db, { reportId: created.id });
  return { report: summary!, done };
}

async function writeReport(
  { db, ai, logger, live }: ReportDeps,
  actor: SessionUser,
  project: typeof projects.$inferSelect,
  reportId: string,
  period: { periodStart: string; periodEnd: string },
  evidence: Awaited<ReturnType<typeof eligibleEvidence>>,
) {
  const event = { reportId, projectId: project.id, projectName: project.name, actorId: actor.id };
  try {
    const facts = buildReportFacts({
      project: {
        name: project.name,
        description: project.description,
        sdgGoals: project.sdgGoals,
        csrCategory: project.csrCategory,
      },
      period: { start: period.periodStart, end: period.periodEnd },
      assets: evidence.map((e) => ({ ...e, approvedByAdmin: e.reviewDecision === 'approve' })),
    });
    const draft = await ai.generateReport(facts).catch((err: unknown) => {
      logger.warn({ reportId, reason: (err as Error).message }, 'Report model call failed');
      throw new ReportFailure(GENERIC_FAILURE);
    });
    const { summary, claims, dropped } = validateReportDraft(
      draft,
      new Set(evidence.map((e) => e.id)),
    );
    const reasons: Partial<Record<DropReason, number>> = {};
    for (const d of dropped) reasons[d.reason] = (reasons[d.reason] ?? 0) + 1;
    logger.info(
      { reportId, kept: claims.length, dropped: dropped.length, reasons },
      'Report claims validated',
    );
    if (claims.length === 0) {
      throw new ReportFailure(
        'None of the statements the model wrote cited verified evidence, so none could be kept. Try again.',
      );
    }

    await db.transaction(async (tx) => {
      await tx.insert(reportClaims).values(claims.map((c) => ({ reportId, ...c })));
      await tx
        .update(reports)
        .set({ status: 'ready', summary: summary || null, droppedClaims: dropped.length })
        .where(eq(reports.id, reportId));
      await recordEvent(tx, project.orgId, 'report.created', {
        ...event,
        status: 'ready',
        claims: claims.length,
        droppedClaims: dropped.length,
      });
    });
  } catch (err) {
    const message = err instanceof ReportFailure ? err.message : GENERIC_FAILURE;
    if (!(err instanceof ReportFailure))
      logger.error({ err, reportId }, 'Report generation failed');
    await db
      .transaction(async (tx) => {
        await tx
          .update(reports)
          .set({ status: 'failed', error: message })
          .where(eq(reports.id, reportId));
        await recordEvent(tx, project.orgId, 'report.created', { ...event, status: 'failed' });
      })
      .catch((e: unknown) => logger.error({ err: e, reportId }, 'Could not record report failure'));
  } finally {
    live.poke();
  }
}

/** A restart loses any generation in flight; say so instead of spinning forever. */
export async function failInterruptedReports(db: Db) {
  const rows = await db
    .update(reports)
    .set({ status: 'failed', error: 'Interrupted by a server restart. Generate it again.' })
    .where(eq(reports.status, 'generating'))
    .returning({ id: reports.id });
  return rows.length;
}

interface SummaryFilter {
  reportId?: string;
  projectId?: string;
  orgId?: string;
  readyOnly?: boolean;
}

/** Report rows with claim and cited-asset counts, newest first. */
export async function reportSummaries(db: Db, filter: SummaryFilter): Promise<ReportSummary[]> {
  const where: SQL[] = [];
  if (filter.reportId) where.push(sql`r.id = ${filter.reportId}`);
  if (filter.projectId) where.push(sql`r.project_id = ${filter.projectId}`);
  if (filter.orgId) where.push(sql`p.org_id = ${filter.orgId}`);
  if (filter.readyOnly) where.push(sql`r.status = 'ready'`);

  const { rows } = await db.execute<{
    id: string;
    project_id: string;
    period_start: string;
    period_end: string;
    status: ReportSummary['status'];
    summary: string | null;
    dropped_claims: number;
    error: string | null;
    generated_by: string | null;
    created_at: string | Date;
    claim_count: number;
    cited_count: number;
  }>(sql`
    select
      r.id, r.project_id, r.period_start::text as period_start, r.period_end::text as period_end,
      r.status, r.summary, r.dropped_claims, r.error, u.name as generated_by, r.created_at,
      coalesce(s.claim_count, 0)::int as claim_count, coalesce(s.cited_count, 0)::int as cited_count
    from reports r
    join projects p on p.id = r.project_id
    left join users u on u.id = r.generated_by
    left join lateral (
      select count(distinct rc.id) as claim_count, count(distinct cited.id) as cited_count
      from report_claims rc
      left join lateral unnest(rc.asset_ids) as cited(id) on true
      where rc.report_id = r.id
    ) s on true
    where ${where.length > 0 ? sql.join(where, sql` and `) : sql`true`}
    order by r.created_at desc
  `);
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    status: r.status,
    summary: r.summary,
    claimCount: r.claim_count,
    citedAssetCount: r.cited_count,
    droppedClaims: r.dropped_claims,
    error: r.error,
    generatedBy: r.generated_by,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function listReports(db: Db, projectId: string, readyOnly = false) {
  return reportSummaries(db, { projectId, readyOnly });
}

/**
 * A report with its claims grouped into sections and its evidence annex: every cited asset
 * with its current checks and review history. `publicView` hides who uploaded each file.
 */
export async function loadReportDetail(
  db: Db,
  media: MediaStore,
  filter: SummaryFilter & { reportId: string },
  { publicView = false } = {},
): Promise<ReportDetail> {
  const [summary] = await reportSummaries(db, filter);
  if (!summary) throw new HttpError(404, 'Report not found');

  const [context] = await db
    .select({
      projectName: projects.name,
      sdgGoals: projects.sdgGoals,
      csrCategory: projects.csrCategory,
      organisationName: organizations.name,
    })
    .from(projects)
    .innerJoin(organizations, eq(organizations.id, projects.orgId))
    .where(eq(projects.id, summary.projectId));

  const claims = await db
    .select()
    .from(reportClaims)
    .where(eq(reportClaims.reportId, summary.id))
    .orderBy(asc(reportClaims.position));

  // Claims are stored in reading order, so consecutive claims share a section.
  const sections: ReportSection[] = [];
  for (const c of claims) {
    const claim = {
      id: c.id,
      position: c.position,
      section: c.section,
      sentence: c.sentence,
      assetIds: c.assetIds,
    };
    const last = sections.at(-1);
    if (last && last.heading === c.section) last.claims.push(claim);
    else sections.push({ heading: c.section, claims: [claim] });
  }

  return {
    ...summary,
    ...context!,
    sections,
    evidence: await evidenceAnnex(db, media, claims, publicView),
  };
}

async function evidenceAnnex(
  db: Db,
  media: MediaStore,
  claims: { position: number; assetIds: string[] }[],
  publicView: boolean,
): Promise<ReportEvidence[]> {
  const order = evidenceOrder(claims);
  if (order.length === 0) return [];

  const [found, checks, history] = await Promise.all([
    listAssetRows(db, media, inArray(assets.id, order), { order: 'oldest' }),
    db.select().from(trustChecks).where(inArray(trustChecks.assetId, order)),
    db
      .select({ review: reviews, reviewerName: users.name })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.reviewerId))
      .where(inArray(reviews.assetId, order))
      .orderBy(desc(reviews.createdAt)),
  ]);
  const byId = new Map(found.map((a) => [a.id, a]));

  return order.flatMap((id, i) => {
    const asset = byId.get(id);
    if (!asset) return [];
    return [
      {
        ref: `E${i + 1}`,
        asset: publicView ? { ...asset, uploadedBy: null } : asset,
        checks: checks
          .filter((c) => c.assetId === id)
          .sort((a, b) => CHECK_TYPES.indexOf(a.checkType) - CHECK_TYPES.indexOf(b.checkType))
          .map((c) => ({
            type: c.checkType,
            passed: c.passed,
            deduction: c.deduction,
            reason: c.reason,
            detail: c.detail,
          })),
        reviews: history
          .filter((h) => h.review.assetId === id)
          .map(({ review, reviewerName }) => ({
            id: review.id,
            decision: review.decision as ReviewDecision,
            note: review.note,
            reviewerName,
            trustScoreAtReview: review.trustScoreAtReview,
            createdAt: review.createdAt.toISOString(),
          })),
        citedIn: claims.filter((c) => c.assetIds.includes(id)).map((c) => c.position),
      },
    ];
  });
}

/** The PDF, with thumbnails fetched from Cloudinary a few at a time. */
export async function buildReportPdf(db: Db, media: MediaStore, report: ReportDetail) {
  const ids = assetsShownInPdf(report);
  const rows = ids.length
    ? await db
        .select({
          id: assets.id,
          publicId: assets.cloudinaryPublicId,
          resourceType: assets.resourceType,
        })
        .from(assets)
        .where(inArray(assets.id, ids))
    : [];
  const images = new Map<string, Buffer | null>();
  for (let i = 0; i < rows.length; i += STILL_CONCURRENCY) {
    await Promise.all(
      rows.slice(i, i + STILL_CONCURRENCY).map(async (r) => {
        images.set(r.id, await media.fetchStill(r.publicId, r.resourceType));
      }),
    );
  }
  return renderReportPdf(report, images);
}

export async function deleteReport(db: Db, orgId: string, reportId: string) {
  const [summary] = await reportSummaries(db, { reportId, orgId });
  if (!summary) throw new HttpError(404, 'Report not found');
  await db.delete(reports).where(eq(reports.id, summary.id));
}

/** "borewell-project-2024-01-01_2024-12-31" for download file names. */
export function reportFileName(
  detail: Pick<ReportDetail, 'projectName' | 'periodStart' | 'periodEnd'>,
) {
  const slug =
    detail.projectName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project';
  return `pramaan-report-${slug}-${detail.periodStart}_${detail.periodEnd}`;
}
