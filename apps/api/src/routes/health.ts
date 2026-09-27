import type { HealthResponse } from '@pramaan/shared';
import { sql } from 'drizzle-orm';
import { Router } from 'express';
import pkg from '../../package.json' with { type: 'json' };
import type { Db } from '../db/client.js';

export function healthRouter(db: Db) {
  const router = Router();

  router.get('/', async (req, res) => {
    const database: HealthResponse['database'] = {
      connected: false,
      pgvector: false,
      latencyMs: null,
    };
    try {
      const started = performance.now();
      const result = await db.execute<{ pgvector: boolean }>(
        sql`select exists(select 1 from pg_extension where extname = 'vector') as pgvector`,
      );
      database.latencyMs = Math.round(performance.now() - started);
      database.connected = true;
      database.pgvector = result.rows[0]?.pgvector === true;
    } catch (err) {
      req.log.warn({ err }, 'Health check could not reach the database');
    }

    const body: HealthResponse = {
      status: database.connected && database.pgvector ? 'ok' : 'degraded',
      version: pkg.version,
      uptimeSeconds: Math.round(process.uptime()),
      database,
    };
    res.status(body.status === 'ok' ? 200 : 503).json(body);
  });

  return router;
}
