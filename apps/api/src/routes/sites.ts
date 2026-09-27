import { siteInput, type Site } from '@pramaan/shared';
import { asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { Router, type Request } from 'express';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
import { assets, sites } from '../db/schema.js';
import { requireProject, requireSite } from '../services/access.js';
import { rescoreAssets } from '../services/scoring.js';
import { getOrgSettings } from '../services/settings.js';

function siteRows(db: Db) {
  return db
    .select({
      ...getTableColumns(sites),
      assetCount: sql<number>`(select count(*) from ${assets} where ${assets.siteId} = ${sites.id})::int`,
    })
    .from(sites);
}

type SiteRow = Awaited<ReturnType<typeof siteRows>>[number];

const toSite = (s: SiteRow): Site => ({
  id: s.id,
  projectId: s.projectId,
  name: s.name,
  lat: s.lat,
  lng: s.lng,
  radiusM: s.radiusM,
  createdAt: s.createdAt.toISOString(),
  assetCount: s.assetCount,
});

async function loadSite(db: Db, id: string) {
  const [row] = await siteRows(db).where(eq(sites.id, id));
  return toSite(row!);
}

/** The `:projectId` from the parent mount path (the router uses mergeParams). */
const parentProjectId = (req: Request) =>
  (req.params as Record<string, string | undefined>).projectId;

/** `/api/projects/:projectId/sites`: list and create. */
export function projectSitesRouter(db: Db) {
  const router = Router({ mergeParams: true });
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const project = await requireProject(db, currentUser(req).orgId, parentProjectId(req));
    const rows = await siteRows(db)
      .where(eq(sites.projectId, project.id))
      .orderBy(asc(sites.createdAt));
    res.json({ sites: rows.map(toSite) });
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    const project = await requireProject(db, currentUser(req).orgId, parentProjectId(req));
    const input = siteInput.parse(req.body);
    const [created] = await db
      .insert(sites)
      .values({ ...input, projectId: project.id })
      .returning({ id: sites.id });
    res.status(201).json(await loadSite(db, created!.id));
  });

  return router;
}

/** `/api/sites/:id`: edit and delete. Both re-score the site's evidence. */
export function sitesRouter(db: Db) {
  const router = Router();
  router.use(requireAuth);

  router.put('/:id', requireRole('admin'), async (req, res) => {
    const { orgId } = currentUser(req);
    const site = await requireSite(db, orgId, req.params.id);
    const input = siteInput.parse(req.body);
    await db.update(sites).set(input).where(eq(sites.id, site.id));
    // Location, radius and name all feed the wrong-location check and its reason.
    await rescoreAssets(db, orgId, await getOrgSettings(db, orgId), { siteId: site.id });
    res.json(await loadSite(db, site.id));
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    const { orgId } = currentUser(req);
    const site = await requireSite(db, orgId, req.params.id);
    const orphaned = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.siteId, site.id));
    await db.delete(sites).where(eq(sites.id, site.id));
    // Evidence stays with the project, unassigned; its location can no longer be checked.
    await rescoreAssets(db, orgId, await getOrgSettings(db, orgId), {
      assetIds: orphaned.map((a) => a.id),
    });
    res.status(204).end();
  });

  return router;
}
