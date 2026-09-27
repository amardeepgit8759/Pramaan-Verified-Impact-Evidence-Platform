import { CHECK_TYPES, TRUST_BANDS, type Asset, type AssetDetail } from '@pramaan/shared';
import { and, arrayContains, asc, desc, eq, gte, lt, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { assets, projects, sites, trustChecks, users } from '../db/schema.js';
import { HttpError } from '../http-error.js';
import type { MediaStore } from './media.js';

const isoDate = z.iso.date();

/** Query-string filters for evidence lists. Dates are capture days, inclusive. */
export const assetFilters = z.object({
  siteId: z.uuid().optional(),
  band: z.enum(TRUST_BANDS).optional(),
  tag: z.string().trim().toLowerCase().min(1).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type AssetFilters = z.infer<typeof assetFilters>;

function baseQuery(db: Db) {
  return db
    .select({
      asset: assets,
      projectName: projects.name,
      siteName: sites.name,
      uploaderName: users.name,
    })
    .from(assets)
    .innerJoin(projects, eq(projects.id, assets.projectId))
    .leftJoin(sites, eq(sites.id, assets.siteId))
    .leftJoin(users, eq(users.id, assets.uploadedBy));
}

type Row = Awaited<ReturnType<typeof baseQuery>>[number];

function toAsset({ asset: a, projectName, siteName, uploaderName }: Row, media: MediaStore): Asset {
  return {
    id: a.id,
    projectId: a.projectId,
    projectName,
    siteId: a.siteId,
    siteName: siteName ?? null,
    uploadedBy: uploaderName ?? null,
    resourceType: a.resourceType,
    format: a.format,
    width: a.width,
    height: a.height,
    bytes: a.bytes,
    originalFilename: a.originalFilename,
    secureUrl: a.secureUrl,
    thumbnailUrl: media.thumbnailUrl(a.cloudinaryPublicId, a.resourceType),
    previewUrl: media.previewUrl(a.cloudinaryPublicId, a.resourceType),
    capturedAt: a.capturedAt?.toISOString() ?? null,
    uploadedAt: a.uploadedAt.toISOString(),
    lat: a.lat,
    lng: a.lng,
    tags: a.tags,
    taggingProvider: a.taggingProvider,
    caption: a.caption,
    trustScore: a.trustScore,
    trustBand: a.trustBand,
    reviewDecision: a.reviewDecision,
  };
}

export async function listProjectAssets(
  db: Db,
  media: MediaStore,
  projectId: string,
  filters: AssetFilters,
): Promise<Asset[]> {
  const where: SQL[] = [eq(assets.projectId, projectId)];
  if (filters.siteId) where.push(eq(assets.siteId, filters.siteId));
  if (filters.band) where.push(eq(assets.trustBand, filters.band));
  if (filters.tag) where.push(arrayContains(assets.tags, [filters.tag]));
  if (filters.from) where.push(gte(assets.capturedAt, new Date(`${filters.from}T00:00:00Z`)));
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    where.push(lt(assets.capturedAt, end));
  }
  return listAssetRows(db, media, and(...where), { order: 'newest' });
}

/** Assets matching `where`, newest or oldest upload first. */
export async function listAssetRows(
  db: Db,
  media: MediaStore,
  where: SQL | undefined,
  { order, limit }: { order: 'newest' | 'oldest'; limit?: number },
): Promise<Asset[]> {
  const query = baseQuery(db)
    .where(where)
    .orderBy(order === 'newest' ? desc(assets.uploadedAt) : asc(assets.uploadedAt));
  const rows = limit ? await query.limit(limit) : await query;
  return rows.map((r) => toAsset(r, media));
}

export async function loadAssetDetail(
  db: Db,
  media: MediaStore,
  orgId: string,
  id: unknown,
): Promise<AssetDetail> {
  const parsed = z.uuid().safeParse(id);
  const [row] = parsed.success
    ? await baseQuery(db).where(and(eq(assets.id, parsed.data), eq(assets.orgId, orgId)))
    : [];
  if (!row) throw new HttpError(404, 'Evidence not found');

  const checks = await db
    .select()
    .from(trustChecks)
    .where(eq(trustChecks.assetId, row.asset.id))
    .orderBy(asc(trustChecks.createdAt));
  // Always present checks in the canonical order.
  checks.sort((a, b) => CHECK_TYPES.indexOf(a.checkType) - CHECK_TYPES.indexOf(b.checkType));

  return {
    ...toAsset(row, media),
    checks: checks.map((c) => ({
      type: c.checkType,
      passed: c.passed,
      deduction: c.deduction,
      reason: c.reason,
      detail: c.detail,
    })),
    exif: row.asset.exif,
  };
}
