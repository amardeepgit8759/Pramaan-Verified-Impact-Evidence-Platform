import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
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
import { searchRouter } from './routes/search.js';
import { settingsRouter } from './routes/settings.js';
import { projectSitesRouter, sitesRouter } from './routes/sites.js';
import { projectsRouter } from './routes/projects.js';
import { projectReportsRouter, reportsRouter } from './routes/reports.js';
import { projectShareLinksRouter, sharedRouter, shareLinksRouter } from './routes/share.js';
import { publicRouter } from './routes/public.js';
import { usersRouter } from './routes/users.js';
import { liveRouter } from './routes/live.js';
import { aiRateLimiters } from './ai-rate-limit.js';
import type { AiClient } from './services/ai.js';
import type { LiveHub } from './services/live.js';
import type { MediaStore } from './services/media.js';

export interface AppDeps {
  env: Env;
  db: Db;
  logger: Logger;
  /** Cloudinary; a test double in tests. */
  media: MediaStore;
  /** Gemini; a test double in tests. */
  ai: AiClient;
  /** Server-Sent Events fan-out. */
  live: LiveHub;
}

export function createApp({ env, db, logger, media, ai, live }: AppDeps) {
  const ingest = { db, env, media, ai, logger };
  const reportDeps = { db, ai, media, logger, live };
  const app = express();
  app.disable('x-powered-by');
  app.use(
    compression({
      // Live updates must reach the browser as they happen; gzip would buffer the stream.
      filter: (req, res) =>
        !String(res.getHeader('Content-Type') ?? '').startsWith('text/event-stream') &&
        compression.filter(req, res),
    }),
  );
  // Render (and most PaaS) terminate TLS at one proxy hop; needed for correct client IPs.
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(
    helmet({
      // OpenStreetMap refuses tile requests without a Referer, so send just our origin to
      // other sites: never the path, which holds share-link tokens.
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
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
          'style-src': ["'self'", "'unsafe-inline'"],
          'font-src': ["'self'", 'data:'],
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
  // Once a write has finished (its transaction committed), stream any new events.
  api.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') res.on('finish', () => live.poke());
    next();
  });
  api.use(authenticate(db, env));
  // Gemini-backed endpoints get their own, tighter limits (keyed by user or organisation).
  const limits = aiRateLimiters(env);
  api.get('/search', limits.ai);
  api.post('/assets/confirm', limits.ai);
  api.post('/projects/:projectId/reports', limits.reports);
  api.use('/health', healthRouter(db));
  api.use('/public', publicRouter(db));
  api.use('/share/:token', sharedRouter({ db, media }));
  api.use('/auth', authRouter(db, env));
  api.use('/users', usersRouter(db));
  api.use('/projects/:projectId/sites', projectSitesRouter(db));
  api.use('/projects/:projectId/assets', projectAssetsRouter(ingest));
  api.use('/uploads', uploadsRouter(ingest));
  api.use('/assets', assetsRouter(ingest));
  api.use('/projects/:projectId/reports', projectReportsRouter(reportDeps));
  api.use('/projects/:projectId/share-links', projectShareLinksRouter(db));
  api.use('/projects', projectsRouter(db));
  api.use('/reports', reportsRouter(reportDeps));
  api.use('/share-links', shareLinksRouter(db));
  api.use('/sites', sitesRouter(db, media));
  api.use('/search', searchRouter({ db, ai, media, logger }));
  api.use('/settings', settingsRouter(db));
  api.use('/org', orgRouter(db));
  api.use(liveRouter(db, live, media));
  api.use(notFoundHandler);
  app.use('/api', api);

  if (env.WEB_DIST_DIR) {
    const origin = (env.PUBLIC_URL ?? env.RENDER_EXTERNAL_URL ?? '').replace(/\/+$/, '');
    serveWebApp(app, path.resolve(env.WEB_DIST_DIR), origin, logger);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/** Serve the built SPA from the same origin so cookies and SSE need no CORS. */
function serveWebApp(app: express.Express, distDir: string, origin: string, logger: Logger) {
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
  // Absolute URLs for social previews; relative when no public origin is configured.
  const html = fs.readFileSync(indexHtml, 'utf8').replaceAll('__PUBLIC_ORIGIN__', origin);
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    // Funder share pages are private links: keep them out of search engines.
    if (req.path.startsWith('/share/')) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.type('html').send(html);
  });
}
