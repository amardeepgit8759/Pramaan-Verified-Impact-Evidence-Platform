import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Db } from './db/client.js';
import type { Env } from './env.js';
import { errorHandler, notFoundHandler } from './http-error.js';
import type { Logger } from './logger.js';
import { healthRouter } from './routes/health.js';

export interface AppDeps {
  env: Env;
  db: Db;
  logger: Logger;
}

export function createApp({ env, db, logger }: AppDeps) {
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
            'https://*.tile.openstreetmap.org',
          ],
          'media-src': ["'self'", 'blob:', 'https://res.cloudinary.com'],
          'connect-src': ["'self'", 'https://api.cloudinary.com'],
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
  api.use('/health', healthRouter(db));
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
