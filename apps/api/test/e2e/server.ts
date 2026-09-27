/**
 * The app as deployed, for Playwright: real API, real database, the built web app on the
 * same origin, with Cloudinary and Gemini replaced by test doubles (they need credentials
 * and network, and would make browser tests slow and flaky). Never used in production.
 *
 *   pnpm --filter @pramaan/api exec tsx test/e2e/server.ts
 */
import express from 'express';
import { createApp } from '../../src/app.js';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { loadEnv } from '../../src/env.js';
import { createLogger } from '../../src/logger.js';
import { LiveHub } from '../../src/services/live.js';
import { FakeAiClient } from '../fakes.js';
import { FakeCloudinary } from './fake-cloudinary.js';

const placeholder = (name: string) => process.env[name] || `e2e-${name.toLowerCase()}`;
const env = loadEnv({
  ...process.env,
  CLOUDINARY_CLOUD_NAME: placeholder('CLOUDINARY_CLOUD_NAME'),
  CLOUDINARY_API_KEY: placeholder('CLOUDINARY_API_KEY'),
  CLOUDINARY_API_SECRET: placeholder('CLOUDINARY_API_SECRET'),
  GEMINI_API_KEY: placeholder('GEMINI_API_KEY'),
  GEMINI_VISION_MODEL: placeholder('GEMINI_VISION_MODEL'),
  GEMINI_REPORT_MODEL: placeholder('GEMINI_REPORT_MODEL'),
  GEMINI_EMBEDDING_MODEL: placeholder('GEMINI_EMBEDDING_MODEL'),
  JWT_SECRET: process.env.JWT_SECRET || 'e2e-secret-that-is-at-least-32-characters',
});

const logger = createLogger(env);
const { db } = createDb(env.DATABASE_URL);
await runMigrations(db);

const baseUrl = `http://localhost:${env.PORT}`;
const media = new FakeCloudinary(baseUrl);
const ai = new FakeAiClient();
const live = new LiveHub(db, logger, { pollMs: 500 });
await live.init();

const server = express();
server.use(media.router());
server.use(createApp({ env, db, logger, media, ai, live }));
server.listen(env.PORT, () => logger.info(`e2e server on ${baseUrl}`));
