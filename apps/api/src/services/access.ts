import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { projects, sites } from '../db/schema.js';
import { HttpError } from '../http-error.js';

const uuid = z.uuid();

/**
 * Load a project that belongs to the caller's organization. Malformed ids, missing ids and
 * other organizations' ids all look the same from outside: 404.
 */
export async function requireProject(db: Db, orgId: string, id: unknown) {
  const parsed = uuid.safeParse(id);
  const [project] = parsed.success
    ? await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, parsed.data), eq(projects.orgId, orgId)))
    : [];
  if (!project) throw new HttpError(404, 'Project not found');
  return project;
}

export async function requireSite(db: Db, orgId: string, id: unknown) {
  const parsed = uuid.safeParse(id);
  const [row] = parsed.success
    ? await db
        .select({ site: sites })
        .from(sites)
        .innerJoin(projects, eq(projects.id, sites.projectId))
        .where(and(eq(sites.id, parsed.data), eq(projects.orgId, orgId)))
    : [];
  if (!row) throw new HttpError(404, 'Site not found');
  return row.site;
}
