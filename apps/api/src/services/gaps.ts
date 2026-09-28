import { siteGapStatus, type ProjectStatus, type SiteGapStatus } from '@pramaan/shared';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { sites } from '../db/schema.js';
import type { Logger } from '../logger.js';
import { recordEvents } from './events.js';
import { getOrgSettings } from './settings.js';

/**
 * "Counts as verified evidence": verified and not rejected, or approved by an admin.
 * Mirrors isReportEligible in packages/shared.
 */
export const ELIGIBLE = sql.raw(
  `((a.trust_band = 'verified' and a.review_decision is distinct from 'reject') or a.review_decision = 'approve')`,
);

export interface SiteEvidence {
  siteId: string;
  siteName: string;
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
  count: number;
  verified: number;
  lastVerifiedAt: Date | null;
  /** The last gap state we stored (null: never computed). */
  storedGap: boolean | null;
  status: SiteGapStatus;
}

/**
 * Every site in scope with its evidence counts and live documentation-gap status. A gap is
 * an active project's site with no verified evidence in the last `gapDays` (by capture time,
 * or upload time when there's none), or none ever.
 */
export async function computeSiteEvidence(
  db: Db,
  orgId: string,
  projectId: string | null,
  now = new Date(),
): Promise<SiteEvidence[]> {
  const scope = projectId
    ? sql`p.org_id = ${orgId} and p.id = ${projectId}`
    : sql`p.org_id = ${orgId}`;
  const { rows } = await db.execute<{
    site_id: string;
    site_name: string;
    stored_gap: boolean | null;
    project_id: string;
    project_name: string;
    project_status: ProjectStatus;
    count: number;
    verified: number;
    last_verified: string | null;
  }>(sql`
    select
      s.id as site_id, s.name as site_name, s.gap as stored_gap,
      p.id as project_id, p.name as project_name, p.status as project_status,
      count(a.id)::int as count,
      count(a.id) filter (where ${ELIGIBLE})::int as verified,
      max(coalesce(a.captured_at, a.uploaded_at)) filter (where ${ELIGIBLE}) as last_verified
    from sites s
    join projects p on p.id = s.project_id
    left join assets a on a.site_id = s.id
    where ${scope}
    group by s.id, p.id
    order by count(a.id) desc, s.name
  `);

  const { gapDays } = await getOrgSettings(db, orgId);
  return rows.map((r) => {
    const lastVerifiedAt = r.last_verified ? new Date(r.last_verified) : null;
    return {
      siteId: r.site_id,
      siteName: r.site_name,
      projectId: r.project_id,
      projectName: r.project_name,
      projectStatus: r.project_status,
      count: r.count,
      verified: r.verified,
      lastVerifiedAt,
      storedGap: r.stored_gap,
      status: siteGapStatus({ projectStatus: r.project_status, lastVerifiedAt, gapDays, now }),
    };
  });
}

/**
 * Recompute every site's gap state for an organisation and emit `site.gap_changed` for each
 * site that entered or left a gap. The first computation for a site only records the state;
 * a brand-new site isn't "news". Call after anything that can change a gap, and on a timer
 * (time alone opens gaps).
 */
export async function refreshGaps(db: Db, orgId: string, now = new Date()) {
  const all = await computeSiteEvidence(db, orgId, null, now);
  const changed = all.filter((s) => s.storedGap !== s.status.gap);
  if (changed.length === 0) return [];

  await db.transaction(async (tx) => {
    for (const s of changed) {
      await tx.update(sites).set({ gap: s.status.gap }).where(eq(sites.id, s.siteId));
    }
    await recordEvents(
      tx,
      orgId,
      changed
        .filter((s) => s.storedGap !== null)
        .map((s) => ({
          type: 'site.gap_changed' as const,
          payload: {
            siteId: s.siteId,
            siteName: s.siteName,
            projectId: s.projectId,
            projectName: s.projectName,
            gap: s.status.gap,
            reason: s.status.reason,
          },
        })),
    );
  });
  return changed;
}

/** Re-check every organisation's gaps; for the hourly timer. Never throws. */
export async function refreshAllGaps(db: Db, logger: Logger) {
  try {
    const orgs = await db.execute<{ id: string }>(sql`select id from organizations`);
    for (const { id } of orgs.rows) await refreshGaps(db, id);
  } catch (err) {
    logger.warn({ err }, 'Periodic gap refresh failed');
  }
}
