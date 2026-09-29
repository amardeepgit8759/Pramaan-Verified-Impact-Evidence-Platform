import { randomBytes } from 'node:crypto';
import { CHECK_TYPES, shareLinkInput, type ShareLink, type SharedProject } from '@pramaan/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { SessionUser } from '../auth/session.js';
import type { Db } from '../db/client.js';
import {
  assets,
  organizations,
  projects,
  shareLinks,
  sites,
  trustChecks,
  users,
} from '../db/schema.js';
import { HttpError } from '../http-error.js';
import { requireProject } from './access.js';
import { listAssetRows } from './asset-views.js';
import type { MediaStore } from './media.js';
import { eligibleAsset, listReports } from './reports.js';

/** 24 random bytes: 32 URL-safe characters, unguessable. */
export const newShareToken = () => randomBytes(24).toString('base64url');
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32}$/;
const DAY_MS = 86_400_000;

type LinkRow = typeof shareLinks.$inferSelect & { createdByName: string | null };

const toShareLink = (row: LinkRow, now = new Date()): ShareLink => ({
  id: row.id,
  token: row.token,
  expiresAt: row.expiresAt.toISOString(),
  expired: row.expiresAt <= now,
  createdBy: row.createdByName,
  createdAt: row.createdAt.toISOString(),
});

function linkRows(db: Db) {
  return db
    .select({ link: shareLinks, createdByName: users.name })
    .from(shareLinks)
    .leftJoin(users, eq(users.id, shareLinks.createdBy));
}

export async function listShareLinks(db: Db, orgId: string, projectId: unknown) {
  const project = await requireProject(db, orgId, projectId);
  const rows = await linkRows(db)
    .where(eq(shareLinks.projectId, project.id))
    .orderBy(desc(shareLinks.createdAt));
  return rows.map((r) => toShareLink({ ...r.link, createdByName: r.createdByName }));
}

export async function createShareLink(
  db: Db,
  actor: SessionUser,
  projectId: unknown,
  body: unknown,
) {
  const project = await requireProject(db, actor.orgId, projectId);
  const { expiresInDays } = shareLinkInput.parse(body);
  const [row] = await db
    .insert(shareLinks)
    .values({
      projectId: project.id,
      token: newShareToken(),
      expiresAt: new Date(Date.now() + expiresInDays * DAY_MS),
      createdBy: actor.id,
    })
    .returning();
  return toShareLink({ ...row!, createdByName: actor.name });
}

/** Revoking deletes the link: the URL stops working at once. */
export async function revokeShareLink(db: Db, orgId: string, id: unknown) {
  const parsed = z.uuid().safeParse(id);
  const [row] = parsed.success
    ? await db
        .select({ id: shareLinks.id })
        .from(shareLinks)
        .innerJoin(projects, eq(projects.id, shareLinks.projectId))
        .where(and(eq(shareLinks.id, parsed.data), eq(projects.orgId, orgId)))
    : [];
  if (!row) throw new HttpError(404, 'Share link not found');
  await db.delete(shareLinks).where(eq(shareLinks.id, row.id));
}

/**
 * The project a token opens. Unknown or revoked tokens are 404; expired ones are 410 so the
 * page can say the link has expired rather than that it never existed.
 */
export async function resolveShareToken(db: Db, token: unknown, now = new Date()) {
  const [row] =
    typeof token === 'string' && TOKEN_SHAPE.test(token)
      ? await db
          .select({ link: shareLinks, project: projects, organisationName: organizations.name })
          .from(shareLinks)
          .innerJoin(projects, eq(projects.id, shareLinks.projectId))
          .innerJoin(organizations, eq(organizations.id, projects.orgId))
          .where(eq(shareLinks.token, token))
      : [];
  if (!row) throw new HttpError(404, 'This link doesn’t exist or has been revoked.');
  if (row.link.expiresAt <= now) {
    throw new HttpError(410, 'This link has expired. Ask the organisation for a new one.');
  }
  return row;
}

/** The public page: eligible evidence only, with its checks; uploader names are left out. */
export async function loadSharedProject(
  db: Db,
  media: MediaStore,
  shared: Awaited<ReturnType<typeof resolveShareToken>>,
): Promise<SharedProject> {
  const { project, link, organisationName } = shared;

  const [evidence, siteRows, reports, stats] = await Promise.all([
    listAssetRows(db, media, and(eq(assets.projectId, project.id), eligibleAsset), {
      order: 'newest',
    }),
    db
      .select({
        site: sites,
        assetCount: sql<number>`count(${assets.id}) filter (where ${eligibleAsset})::int`,
      })
      .from(sites)
      .leftJoin(assets, eq(assets.siteId, sites.id))
      .where(eq(sites.projectId, project.id))
      .groupBy(sites.id)
      .orderBy(asc(sites.createdAt)),
    listReports(db, project.id, true),
    db
      .select({
        total: sql<number>`count(*)::int`,
        eligible: sql<number>`count(*) filter (where ${eligibleAsset})::int`,
        verified: sql<number>`count(*) filter (where ${assets.trustBand} = 'verified')::int`,
        averageTrust: sql<
          number | null
        >`round(avg(${assets.trustScore}) filter (where ${eligibleAsset}), 1)::float8`,
        lastEvidenceAt: sql<
          string | null
        >`max(coalesce(${assets.capturedAt}, ${assets.uploadedAt})) filter (where ${eligibleAsset})`,
      })
      .from(assets)
      .where(eq(assets.projectId, project.id)),
  ]);

  const ids = evidence.map((a) => a.id);
  const checks = ids.length
    ? await db.select().from(trustChecks).where(inArray(trustChecks.assetId, ids))
    : [];
  const s = stats[0]!;

  return {
    organisationName,
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      startDate: project.startDate,
      endDate: project.endDate,
      sdgGoals: project.sdgGoals,
      csrCategory: project.csrCategory,
      status: project.status,
    },
    expiresAt: link.expiresAt.toISOString(),
    metrics: {
      evidence: s.eligible,
      sites: siteRows.length,
      sitesWithEvidence: siteRows.filter((r) => r.assetCount > 0).length,
      averageTrust: s.averageTrust,
      verifiedPct: s.total > 0 ? Math.round((s.verified / s.total) * 1000) / 10 : null,
      reports: reports.length,
      lastEvidenceAt: s.lastEvidenceAt ? new Date(s.lastEvidenceAt).toISOString() : null,
    },
    sites: siteRows.map(({ site, assetCount }) => ({
      id: site.id,
      projectId: site.projectId,
      name: site.name,
      lat: site.lat,
      lng: site.lng,
      radiusM: site.radiusM,
      createdAt: site.createdAt.toISOString(),
      assetCount,
    })),
    evidence: evidence.map((asset) => ({
      asset: { ...asset, uploadedBy: null },
      checks: checks
        .filter((c) => c.assetId === asset.id)
        .sort((a, b) => CHECK_TYPES.indexOf(a.checkType) - CHECK_TYPES.indexOf(b.checkType))
        .map((c) => ({
          type: c.checkType,
          passed: c.passed,
          deduction: c.deduction,
          reason: c.reason,
          detail: c.detail,
        })),
    })),
    reports,
  };
}
