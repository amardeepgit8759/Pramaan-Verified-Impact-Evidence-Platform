import { createApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import { loadEnv } from '../src/env.js';
import { createLogger } from '../src/logger.js';

/** Build the real app against the test database. Call `close()` in afterAll. */
export function createTestApp() {
  const env = loadEnv();
  const { db, pool } = createDb(env.DATABASE_URL);
  const app = createApp({ env, db, logger: createLogger(env) });
  return { app, db, close: () => pool.end() };
}
