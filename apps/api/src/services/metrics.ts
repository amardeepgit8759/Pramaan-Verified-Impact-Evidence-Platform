import { siteGapStatus, type Metrics, type ProjectStatus } from '@pramaan/shared';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { getOrgSettings } from './settings.js';

/** Days in the uploads-per-day and bands-over-time series (including today). */
const SERIES_DAYS = 30;
/** Window for the "flagged recently" KPI. */
const RECENT_DAYS = 7;

/**
 * "Counts as verified evidence": verified and not rejected, or approved by an admin.
 * Mirrors isReportEligible in packages/shared.
 */
const ELIGIBLE = sql.raw(
  `((a.trust_band = 'verified' and a.review_decision is distinct from 'reject') or a.review_decision = 'approve')`,
);

/** Everything on the dashboard (or one project's overview), computed live in SQL. */
export async function computeMetrics(
  db: Db,
  orgId: string,
  projectId: string | null,
  now = new Date(),
): Promise<Metrics> {
  const inScope = projectId
    ? sql`a.org_id = ${orgId} and a.project_id = ${projectId}`
    : sql`a.org_id = ${orgId}`;
  const projectScope = projectId
    ? sql`p.org_id = ${orgId} and p.id = ${projectId}`
    : sql`p.org_id = ${orgId}`;

  const [totals] = (
    await db.execute<{
      total: number;
      verified: number;
      review: number;
      flagged: number;
      average: number | null;
      flagged_recent: number;
      needs_review: number;
    }>(sql`
      select
        count(*)::int as total,
        count(*) filter (where a.trust_band = 'verified')::int as verified,
        count(*) filter (where a.trust_band = 'review')::int as review,
        count(*) filter (where a.trust_band = 'flagged')::int as flagged,
        round(avg(a.trust_score), 1)::float8 as average,
        count(*) filter (
          where a.trust_band = 'flagged'
            and a.uploaded_at >= ${now}::timestamptz - make_interval(days => ${RECENT_DAYS})
        )::int as flagged_recent,
        count(*) filter (
          where a.trust_band in ('review', 'flagged') and a.review_decision is null
        )::int as needs_review
      from assets a
      where ${inScope}
    `)
  ).rows as [
    {
      total: number;
      verified: number;
      review: number;
      flagged: number;
      average: number | null;
      flagged_recent: number;
      needs_review: number;
    },
  ];

  // One row per UTC day, zero-filled, with band counts by upload day.
  const series = (
    await db.execute<{
      day: string;
      total: number;
      verified: number;
      review: number;
      flagged: number;
    }>(sql`
      with days as (
        select generate_series(
          (${now}::timestamptz at time zone 'utc')::date - ${SERIES_DAYS - 1}::int,
          (${now}::timestamptz at time zone 'utc')::date,
          interval '1 day'
        )::date as day
      )
      select
        to_char(d.day, 'YYYY-MM-DD') as day,
        count(a.id)::int as total,
        count(a.id) filter (where a.trust_band = 'verified')::int as verified,
        count(a.id) filter (where a.trust_band = 'review')::int as review,
        count(a.id) filter (where a.trust_band = 'flagged')::int as flagged
      from days d
      left join assets a on (a.uploaded_at at time zone 'utc')::date = d.day and ${inScope}
      group by d.day
      order by d.day
    `)
  ).rows;

  const perSite = (
    await db.execute<{
      site_id: string;
      site_name: string;
      project_id: string;
      project_name: string;
      project_status: ProjectStatus;
      count: number;
      verified: number;
      last_verified: string | null;
    }>(sql`
      select
        s.id as site_id, s.name as site_name,
        p.id as project_id, p.name as project_name, p.status as project_status,
        count(a.id)::int as count,
        count(a.id) filter (where ${ELIGIBLE})::int as verified,
        max(coalesce(a.captured_at, a.uploaded_at)) filter (where ${ELIGIBLE}) as last_verified
      from sites s
      join projects p on p.id = s.project_id
      left join assets a on a.site_id = s.id
      where ${projectScope}
      group by s.id, p.id
      order by count(a.id) desc, s.name
    `)
  ).rows;

  const [reports] = (
    await db.execute<{ count: number }>(sql`
      select count(*)::int as count
      from reports r join projects p on p.id = r.project_id
      where ${projectScope} and r.status = 'ready'
    `)
  ).rows as [{ count: number }];

  const { gapDays } = await getOrgSettings(db, orgId);
  const gapSites = perSite.flatMap((s) => {
    const status = siteGapStatus({
      projectStatus: s.project_status,
      lastVerifiedAt: s.last_verified ? new Date(s.last_verified) : null,
      gapDays,
      now,
    });
    return status.gap
      ? [
          {
            siteId: s.site_id,
            siteName: s.site_name,
            projectId: s.project_id,
            projectName: s.project_name,
            daysSinceVerified: status.daysSinceVerified,
            reason: status.reason,
          },
        ]
      : [];
  });

  return {
    totalAssets: totals.total,
    verifiedPct: totals.total > 0 ? Math.round((totals.verified / totals.total) * 1000) / 10 : null,
    bands: { verified: totals.verified, review: totals.review, flagged: totals.flagged },
    averageTrust: totals.average,
    flaggedLast7Days: totals.flagged_recent,
    needsReview: totals.needs_review,
    uploadsPerDay: series.map((d) => ({ date: d.day, count: d.total })),
    bandsOverTime: series.map((d) => ({
      date: d.day,
      verified: d.verified,
      review: d.review,
      flagged: d.flagged,
    })),
    assetsPerSite: perSite.map((s) => ({
      siteId: s.site_id,
      siteName: s.site_name,
      projectId: s.project_id,
      count: s.count,
      verified: s.verified,
    })),
    gapSites,
    reportsGenerated: reports.count,
  };
}
