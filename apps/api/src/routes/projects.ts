import { projectInput, projectUpdateInput, type ProjectSummary } from '@pramaan/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
import { assets, projects, sites } from '../db/schema.js';
import { requireProject } from '../services/access.js';
import { assetsMatchingProject, rescoreAssets } from '../services/scoring.js';
import { getOrgSettings } from '../services/settings.js';

/** Project rows with live counts, computed in one query. */
function projectSummaries(db: Db, orgId: string, projectId?: string) {
  return db
    .select({
      project: projects,
      siteCount: sql<number>`(select count(*) from ${sites} where ${sites.projectId} = ${projects.id})::int`,
      assetCount: sql<number>`count(${assets.id})::int`,
      verified: sql<number>`count(*) filter (where ${assets.trustBand} = 'verified')::int`,
      review: sql<number>`count(*) filter (where ${assets.trustBand} = 'review')::int`,
      flagged: sql<number>`count(*) filter (where ${assets.trustBand} = 'flagged')::int`,
      averageTrust: sql<number | null>`round(avg(${assets.trustScore}), 1)::float8`,
    })
    .from(projects)
    .leftJoin(assets, eq(assets.projectId, projects.id))
    .where(and(eq(projects.orgId, orgId), projectId ? eq(projects.id, projectId) : undefined))
    .groupBy(projects.id)
    .orderBy(desc(projects.createdAt));
}

type SummaryRow = Awaited<ReturnType<typeof projectSummaries>>[number];

const toSummary = (r: SummaryRow): ProjectSummary => ({
  id: r.project.id,
  name: r.project.name,
  description: r.project.description,
  startDate: r.project.startDate,
  endDate: r.project.endDate,
  sdgGoals: r.project.sdgGoals,
  csrCategory: r.project.csrCategory,
  status: r.project.status,
  createdAt: r.project.createdAt.toISOString(),
  siteCount: r.siteCount,
  assetCount: r.assetCount,
  bands: { verified: r.verified, review: r.review, flagged: r.flagged },
  averageTrust: r.averageTrust,
});

export function projectsRouter(db: Db) {
  const router = Router();
  router.use(requireAuth);

  async function summary(orgId: string, id: string) {
    const [row] = await projectSummaries(db, orgId, id);
    return toSummary(row!);
  }

  router.get('/', async (req, res) => {
    const rows = await projectSummaries(db, currentUser(req).orgId);
    res.json({ projects: rows.map(toSummary) });
  });

  router.get('/:id', async (req, res) => {
    const { orgId } = currentUser(req);
    const project = await requireProject(db, orgId, req.params.id);
    res.json(await summary(orgId, project.id));
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    const input = projectInput.parse(req.body);
    const { orgId } = currentUser(req);
    const [created] = await db
      .insert(projects)
      .values({ ...input, orgId })
      .returning({ id: projects.id });
    res.status(201).json(await summary(orgId, created!.id));
  });

  /**
   * Edit a project. Its dates decide the wrong-time check, and other projects' duplicate
   * reasons quote its name, so affected assets are re-scored straight away.
   */
  router.put('/:id', requireRole('admin'), async (req, res) => {
    const { orgId } = currentUser(req);
    const before = await requireProject(db, orgId, req.params.id);
    const input = projectUpdateInput.parse(req.body);
    await db.update(projects).set(input).where(eq(projects.id, before.id));

    const settings = await getOrgSettings(db, orgId);
    if (input.startDate !== before.startDate || input.endDate !== before.endDate) {
      await rescoreAssets(db, orgId, settings, { projectId: before.id });
    }
    if (input.name !== before.name) {
      await rescoreAssets(db, orgId, settings, {
        assetIds: await assetsMatchingProject(db, before.id),
      });
    }
    res.json(await summary(orgId, before.id));
  });

  /** Delete a project with its sites and evidence; assets it duplicated are re-scored. */
  router.delete('/:id', requireRole('admin'), async (req, res) => {
    const { orgId } = currentUser(req);
    const project = await requireProject(db, orgId, req.params.id);
    const affected = await assetsMatchingProject(db, project.id);
    await db.delete(projects).where(eq(projects.id, project.id));
    await rescoreAssets(db, orgId, await getOrgSettings(db, orgId), { assetIds: affected });
    res.status(204).end();
  });

  return router;
}
