import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from '../src/db/client.js';
import { assets, organizations, projects, sites } from '../src/db/schema.js';
import { createDefaultSettings } from '../src/services/settings.js';

/** Empty every table (organizations cascades to everything else). */
export async function resetDb(db: Db) {
  await db.execute(sql`truncate table organizations restart identity cascade`);
}

export async function createOrg(db: Db, name = 'Test NGO') {
  const [org] = await db.insert(organizations).values({ name }).returning();
  await createDefaultSettings(db, org!.id);
  return org!;
}

export async function createProject(
  db: Db,
  orgId: string,
  values: Partial<typeof projects.$inferInsert> = {},
) {
  const [project] = await db
    .insert(projects)
    .values({ orgId, name: 'Borewell Project', startDate: '2024-01-01', ...values })
    .returning();
  return project!;
}

export async function createSite(
  db: Db,
  projectId: string,
  values: Partial<typeof sites.$inferInsert> = {},
) {
  const [site] = await db
    .insert(sites)
    .values({ projectId, name: 'Village Rampur', lat: 28.47, lng: 77.03, radiusM: 500, ...values })
    .returning();
  return site!;
}

export async function createAsset(
  db: Db,
  project: { id: string; orgId: string },
  values: Partial<typeof assets.$inferInsert> = {},
) {
  const [asset] = await db
    .insert(assets)
    .values({
      orgId: project.orgId,
      projectId: project.id,
      cloudinaryPublicId: `pramaan/test/${randomUUID()}`,
      resourceType: 'image',
      format: 'jpg',
      bytes: 1024,
      secureUrl: 'https://res.cloudinary.com/test/image/upload/sample.jpg',
      etag: randomUUID(),
      trustScore: 100,
      trustBand: 'verified',
      uploadedAt: new Date('2024-03-01T00:00:00Z'),
      ...values,
    })
    .returning();
  return asset!;
}
