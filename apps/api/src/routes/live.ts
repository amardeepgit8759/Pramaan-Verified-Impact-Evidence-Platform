import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
import { assets, events } from '../db/schema.js';
import { requireProject } from '../services/access.js';
import type { LiveHub } from '../services/live.js';
import type { MediaStore } from '../services/media.js';
import { computeMetrics } from '../services/metrics.js';
import { listAssetRows } from '../services/asset-views.js';

const projectQuery = z.object({ projectId: z.uuid().optional() });

/** Live stream, metrics and activity: everything the dashboard reads. */
export function liveRouter(db: Db, live: LiveHub, media: MediaStore) {
  // Mounted at /api, so each route guards itself (a router-wide guard would turn
  // unknown /api URLs into 401s instead of 404s).
  const router = Router();

  /** SSE. Reconnects send Last-Event-ID (the browser does it) to replay what they missed. */
  router.get('/stream', requireAuth, async (req, res) => {
    const header = req.get('last-event-id') ?? (req.query.lastEventId as string | undefined);
    const lastEventId = header && /^\d+$/.test(header) ? Number(header) : null;
    try {
      await live.subscribe(currentUser(req).orgId, res, lastEventId);
    } catch (err) {
      req.log.error({ err }, 'Live stream failed');
      res.end();
    }
  });

  router.get('/metrics', requireAuth, async (req, res) => {
    const { orgId } = currentUser(req);
    const { projectId } = projectQuery.parse(req.query);
    if (projectId) await requireProject(db, orgId, projectId);
    res.json(await computeMetrics(db, orgId, projectId ?? null));
  });

  /** The activity feed: newest first, optionally one project's, paged with `before`. */
  router.get('/events', requireAuth, async (req, res) => {
    const { orgId } = currentUser(req);
    const q = projectQuery
      .extend({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        before: z.coerce.number().int().positive().optional(),
      })
      .parse(req.query);
    const rows = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.orgId, orgId),
          q.projectId ? sql`${events.payload}->>'projectId' = ${q.projectId}` : undefined,
          q.before ? lt(events.id, q.before) : undefined,
        ),
      )
      .orderBy(desc(events.id))
      .limit(q.limit);
    res.json({
      events: rows.map((e) => ({
        id: e.id,
        type: e.type,
        payload: e.payload,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  });

  /** Assets waiting for an admin: review or flagged, no decision yet. Oldest first. */
  router.get('/review-queue', requireAuth, async (req, res) => {
    const { orgId } = currentUser(req);
    const q = projectQuery
      .extend({ limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query);
    const rows = await listAssetRows(
      db,
      media,
      and(
        eq(assets.orgId, orgId),
        q.projectId ? eq(assets.projectId, q.projectId) : undefined,
        inArray(assets.trustBand, ['review', 'flagged']),
        isNull(assets.reviewDecision),
      ),
      { order: 'oldest', limit: q.limit },
    );
    res.json({ assets: rows });
  });

  return router;
}
