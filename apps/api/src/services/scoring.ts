import {
  computeTrustScore,
  TRUST_BANDS,
  type OrgSettings,
  type RescoreSummary,
  type TrustBand,
  type TrustScoreResult,
} from '@pramaan/shared';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { assets, projects, sites, trustChecks } from '../db/schema.js';
import { findDuplicateCandidates } from './duplicates.js';
import { recordEvents } from './events.js';

/** Project dates are whole days; the scorer works in UTC midnights. */
export const dayToDate = (day: string) => new Date(`${day}T00:00:00Z`);

export interface RescoreScope {
  projectId?: string;
  siteId?: string;
  assetIds?: string[];
}

interface ScoredAsset {
  id: string;
  projectId: string;
  previousScore: number;
  previousBand: TrustBand;
  result: TrustScoreResult;
}

/** Load the assets in scope with everything the Trust Score needs, and score them. */
async function scoreAssets(
  db: Db,
  orgId: string,
  settings: OrgSettings,
  scope: RescoreScope,
): Promise<ScoredAsset[]> {
  const conditions: SQL[] = [eq(assets.orgId, orgId)];
  if (scope.projectId) conditions.push(eq(assets.projectId, scope.projectId));
  if (scope.siteId) conditions.push(eq(assets.siteId, scope.siteId));
  if (scope.assetIds) {
    if (scope.assetIds.length === 0) return [];
    conditions.push(inArray(assets.id, scope.assetIds));
  }

  const rows = await db
    .select({ asset: assets, project: projects, site: sites })
    .from(assets)
    .innerJoin(projects, eq(projects.id, assets.projectId))
    .leftJoin(sites, eq(sites.id, assets.siteId))
    .where(and(...conditions))
    .orderBy(assets.uploadedAt);

  const scored: ScoredAsset[] = [];
  for (const { asset, project, site } of rows) {
    const candidates = await findDuplicateCandidates(db, {
      orgId,
      projectId: asset.projectId,
      assetId: asset.id,
      etag: asset.etag,
      phash: asset.phash,
      phashThreshold: settings.phashThreshold,
    });
    const result = computeTrustScore(
      {
        id: asset.id,
        projectId: asset.projectId,
        etag: asset.etag,
        phash: asset.phash,
        capturedAt: asset.capturedAt,
        uploadedAt: asset.uploadedAt,
        lat: asset.lat,
        lng: asset.lng,
      },
      candidates,
      {
        id: project.id,
        name: project.name,
        startDate: dayToDate(project.startDate),
        endDate: project.endDate ? dayToDate(project.endDate) : null,
      },
      site && { id: site.id, name: site.name, lat: site.lat, lng: site.lng, radiusM: site.radiusM },
      settings,
    );
    scored.push({
      id: asset.id,
      projectId: asset.projectId,
      previousScore: asset.trustScore,
      previousBand: asset.trustBand,
      result,
    });
  }
  return scored;
}

function summarize(scored: ScoredAsset[]): RescoreSummary {
  const counts = new Map<string, number>();
  let scoreChanged = 0;
  for (const s of scored) {
    if (s.result.score !== s.previousScore) scoreChanged++;
    if (s.result.band !== s.previousBand) {
      const key = `${s.previousBand}>${s.result.band}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const transitions = TRUST_BANDS.flatMap((from) =>
    TRUST_BANDS.filter((to) => counts.has(`${from}>${to}`)).map((to) => ({
      from,
      to,
      count: counts.get(`${from}>${to}`)!,
    })),
  );
  return {
    total: scored.length,
    scoreChanged,
    bandChanged: transitions.reduce((sum, t) => sum + t.count, 0),
    transitions,
  };
}

/**
 * Re-run the Trust Score for assets in scope and store the new scores and checks.
 * Emits `asset.rescored` for every asset whose score changed. With `dryRun`, nothing is
 * written: the summary answers "how many assets would change band?".
 */
export async function rescoreAssets(
  db: Db,
  orgId: string,
  settings: OrgSettings,
  scope: RescoreScope = {},
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<RescoreSummary> {
  const scored = await scoreAssets(db, orgId, settings, scope);
  if (!dryRun && scored.length > 0) {
    await db.transaction(async (tx) => {
      for (const s of scored) {
        await tx
          .update(assets)
          .set({ trustScore: s.result.score, trustBand: s.result.band, updatedAt: new Date() })
          .where(eq(assets.id, s.id));
        await tx.delete(trustChecks).where(eq(trustChecks.assetId, s.id));
        await tx.insert(trustChecks).values(
          s.result.checks.map((c) => ({
            assetId: s.id,
            checkType: c.type,
            passed: c.passed,
            deduction: c.deduction,
            reason: c.reason,
            detail: c.detail,
          })),
        );
      }
      await recordEvents(
        tx,
        orgId,
        scored
          .filter((s) => s.result.score !== s.previousScore)
          .map((s) => ({
            type: 'asset.rescored' as const,
            payload: {
              assetId: s.id,
              projectId: s.projectId,
              score: s.result.score,
              band: s.result.band,
              previousScore: s.previousScore,
              previousBand: s.previousBand,
            },
          })),
      );
    });
  }
  return summarize(scored);
}

/**
 * Assets in other projects whose duplicate checks point at this project. Their reasons
 * name the project, and they may stop being duplicates if it changes or goes away.
 */
export async function assetsMatchingProject(db: Db, projectId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ assetId: trustChecks.assetId })
    .from(trustChecks)
    .innerJoin(assets, eq(assets.id, trustChecks.assetId))
    .where(
      and(
        sql`${trustChecks.detail}->>'matchedProjectId' = ${projectId}`,
        sql`${assets.projectId} <> ${projectId}`,
      ),
    );
  return rows.map((r) => r.assetId);
}
