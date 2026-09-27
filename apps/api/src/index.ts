import { createApp } from './app.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { EnvError, loadEnv } from './env.js';
import { createLogger } from './logger.js';
import { GeminiAiClient } from './services/ai.js';
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

const media = new CloudinaryMediaStore(env, logger);
const ai = new GeminiAiClient(env);

const server = createApp({ env, db, logger, media, ai }).listen(env.PORT, () => {
  logger.info(`Pramaan API listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
  server.closeIdleConnections();
  // Long-lived connections (SSE) would otherwise keep the process alive.
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
