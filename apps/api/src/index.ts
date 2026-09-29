import { createApp } from './app.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { EnvError, loadEnv } from './env.js';
import { createLogger } from './logger.js';
import { GeminiAiClient } from './services/ai.js';
import { refreshAllGaps } from './services/gaps.js';
import { failInterruptedReports } from './services/reports.js';
import { LiveHub } from './services/live.js';
import { CloudinaryMediaStore } from './services/media.js';

function readEnv() {
  try {
    return loadEnv();
  } catch (err) {
    if (err instanceof EnvError) {
      console.error(`\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

const env = readEnv();
const logger = createLogger(env);
const { db, pool } = createDb(env.DATABASE_URL);

await runMigrations(db);
logger.info('Database migrations are up to date');

const interrupted = await failInterruptedReports(db);
if (interrupted > 0)
  logger.warn({ interrupted }, 'Marked reports interrupted by a restart as failed');

const media = new CloudinaryMediaStore(env, logger);
const ai = new GeminiAiClient(env);
const live = new LiveHub(db, logger);
await live.init();

/** Gaps open with the passage of time, not only on writes. */
const GAP_REFRESH_MS = 60 * 60_000;
const gapTimer = setInterval(() => {
  void refreshAllGaps(db, logger).then(() => live.poke());
}, GAP_REFRESH_MS);
gapTimer.unref();

const server = createApp({ env, db, logger, media, ai, live }).listen(env.PORT, () => {
  logger.info(`Pramaan API listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
  server.closeIdleConnections();
  live.close();
  // Long-lived connections (SSE) would otherwise keep the process alive.
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
