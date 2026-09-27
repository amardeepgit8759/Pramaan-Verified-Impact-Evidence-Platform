import { createDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { TEST_DATABASE_URL } from './test-db-url.js';

/** Bring the test database's schema up to date once before the suite runs. */
export default async function setup() {
  const url = TEST_DATABASE_URL;
  const { db, pool } = createDb(url);
  try {
    await runMigrations(db);
  } catch (err) {
    throw new Error(
      `Could not migrate the test database at ${url.replace(/\/\/.*@/, '//***@')}.\n` +
        'Start it with `pnpm db:up` (needs Docker running).',
      { cause: err },
    );
  } finally {
    await pool.end();
  }
}
