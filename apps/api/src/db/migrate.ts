import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client.js';

/** Migrations live in apps/api/drizzle; scripts and the Docker image run with apps/api as cwd. */
export const MIGRATIONS_DIR = path.resolve(process.env.MIGRATIONS_DIR ?? 'drizzle');

export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
