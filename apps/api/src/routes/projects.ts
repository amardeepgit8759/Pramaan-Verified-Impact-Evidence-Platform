import { projectInput, type ProjectSummary } from '@pramaan/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
import { assets, projects, sites } from '../db/schema.js';
import { HttpError } from '../http-error.js';

/** Malformed ids are just ids that don't exist, so both are a 404. */
function projectId(params: unknown): string {
  const parsed = z.object({ id: z.uuid() }).safeParse(params);
  if (!parsed.success) throw new HttpError(404, 'Project not found');
  return parsed.data.id;
}

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

  router.get('/', async (req, res) => {
    const rows = await projectSummaries(db, currentUser(req).orgId);
    res.json({ projects: rows.map(toSummary) });
  });

  router.get('/:id', async (req, res) => {
    const id = projectId(req.params);
    const [row] = await projectSummaries(db, currentUser(req).orgId, id);
    if (!row) throw new HttpError(404, 'Project not found');
    res.json(toSummary(row));
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    const input = projectInput.parse(req.body);
    const orgId = currentUser(req).orgId;
    const [created] = await db
      .insert(projects)
      .values({ ...input, orgId })
      .returning({ id: projects.id });
    const [row] = await projectSummaries(db, orgId, created!.id);
    res.status(201).json(toSummary(row!));
  });

  return router;
}
