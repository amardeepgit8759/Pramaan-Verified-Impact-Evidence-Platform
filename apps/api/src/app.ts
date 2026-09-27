import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { authenticate } from './auth/middleware.js';
import type { Db } from './db/client.js';
import type { Env } from './env.js';
import { errorHandler, HttpError, notFoundHandler } from './http-error.js';
import type { Logger } from './logger.js';
import { assetsRouter, projectAssetsRouter, uploadsRouter } from './routes/assets.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { orgRouter } from './routes/org.js';
import { settingsRouter } from './routes/settings.js';
import { projectSitesRouter, sitesRouter } from './routes/sites.js';
import { projectsRouter } from './routes/projects.js';
import { publicRouter } from './routes/public.js';
import { usersRouter } from './routes/users.js';
import type { AiClient } from './services/ai.js';
import type { MediaStore } from './services/media.js';

export interface AppDeps {
  env: Env;
  db: Db;
  logger: Logger;
  /** Cloudinary; a fake in tests. */
  media: MediaStore;
  /** Gemini; a fake in tests. */
  ai: AiClient;
}

export function createApp({ env, db, logger, media, ai }: AppDeps) {
  const ingest = { db, env, media, ai, logger };
  const app = express();
  app.disable('x-powered-by');
  // Render (and most PaaS) terminate TLS at one proxy hop; needed for correct client IPs.
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': [
            "'self'",
            'data:',
            'blob:',
            'https://res.cloudinary.com',
            'https://tile.openstreetmap.org',
            'https://*.tile.openstreetmap.org',
          ],
          'media-src': ["'self'", 'blob:', 'https://res.cloudinary.com'],
          'connect-src': ["'self'", 'https://api.cloudinary.com'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
        },
      },
    }),
  );
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  // Writes must be JSON: HTML forms on other sites can't send that without a CORS preflight,
  // which adds a second CSRF defence on top of the sameSite=lax session cookie.
  api.use((req, _res, next) => {
    const hasBody =
      Number(req.headers['content-length'] ?? 0) > 0 || !!req.headers['transfer-encoding'];
    if (req.method !== 'GET' && req.method !== 'HEAD' && hasBody && !req.is('application/json')) {
      return next(new HttpError(415, 'Send the request body as JSON'));
    }
    next();
  });
  api.use(authenticate(db, env));
  api.use('/health', healthRouter(db));
  api.use('/public', publicRouter(db));
  api.use('/auth', authRouter(db, env));
  api.use('/users', usersRouter(db));
  api.use('/projects/:projectId/sites', projectSitesRouter(db));
  api.use('/projects/:projectId/assets', projectAssetsRouter(ingest));
  api.use('/uploads', uploadsRouter(ingest));
  api.use('/assets', assetsRouter(ingest));
  api.use('/projects', projectsRouter(db));
  api.use('/sites', sitesRouter(db));
  api.use('/settings', settingsRouter(db));
  api.use('/org', orgRouter(db));
  api.use(notFoundHandler);
  app.use('/api', api);

  if (env.WEB_DIST_DIR) serveWebApp(app, path.resolve(env.WEB_DIST_DIR), logger);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/** Serve the built SPA from the same origin so cookies and SSE need no CORS. */
function serveWebApp(app: express.Express, distDir: string, logger: Logger) {
  const indexHtml = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    logger.warn({ distDir }, 'WEB_DIST_DIR has no index.html; web app will not be served');
    return;
  }
  // Vite fingerprints everything under /assets, so those can be cached forever.
  app.use(
    '/assets',
    express.static(path.join(distDir, 'assets'), { maxAge: '1y', immutable: true }),
  );
  app.use(express.static(distDir, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}
