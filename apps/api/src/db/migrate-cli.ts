import { z } from 'zod';
import { createDb } from './client.js';
import { MIGRATIONS_DIR, runMigrations } from './migrate.js';

// Only DATABASE_URL is needed to migrate, so this doesn't require the full app env.
const parsed = z.object({ DATABASE_URL: z.string().min(1) }).safeParse(process.env);
if (!parsed.success) {
  console.error('DATABASE_URL is required to run migrations. Copy .env.example to .env.');
  process.exit(1);
}

const { db, pool } = createDb(parsed.data.DATABASE_URL);
try {
  await runMigrations(db);
  console.log(`Migrations applied from ${MIGRATIONS_DIR}`);
} finally {
  await pool.end();
}
