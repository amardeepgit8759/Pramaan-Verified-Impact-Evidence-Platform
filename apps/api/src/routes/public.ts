import type { PublicStats } from '@pramaan/shared';
import { sql } from 'drizzle-orm';
import { Router } from 'express';
import type { Db } from '../db/client.js';

/** Unauthenticated endpoints. Aggregates only: never names, media or anything per-org. */
export function publicRouter(db: Db) {
  const router = Router();

  router.get('/stats', async (_req, res) => {
    const { rows } = await db.execute<PublicStats>(sql`
      select
        (select count(*) from assets)::int as "totalAssets",
        (select count(*) from assets where trust_band = 'verified')::int as "verifiedAssets",
        (select count(*) from projects)::int as "projects",
        (select count(*) from sites)::int as "sites",
        (select count(*) from reports where status = 'ready')::int as "reports"
    `);
    res.json(rows[0]);
  });

  return router;
}
