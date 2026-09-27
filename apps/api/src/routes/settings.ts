import {
  orgSettingsSchema,
  type SaveSettingsResponse,
  type SettingsResponse,
} from '@pramaan/shared';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
import { settings } from '../db/schema.js';
import { recordEvent } from '../services/events.js';
import { rescoreAssets } from '../services/scoring.js';
import { toOrgSettings } from '../services/settings.js';

export function settingsRouter(db: Db) {
  const router = Router();
  router.use(requireAuth);

  async function load(orgId: string): Promise<SettingsResponse> {
    const [row] = await db.select().from(settings).where(eq(settings.orgId, orgId));
    return { settings: toOrgSettings(row!), updatedAt: row!.updatedAt.toISOString() };
  }

  /** Everyone can see how scores are calculated; only admins can change it. */
  router.get('/', async (req, res) => {
    res.json(await load(currentUser(req).orgId));
  });

  /** What saving these settings would do, without saving: "N assets would change band". */
  router.post('/preview', requireRole('admin'), async (req, res) => {
    const proposed = orgSettingsSchema.parse(req.body);
    res.json(await rescoreAssets(db, currentUser(req).orgId, proposed, {}, { dryRun: true }));
  });

  /** Save, then re-score every asset in the organization with the new settings. */
  router.put('/', requireRole('admin'), async (req, res) => {
    const user = currentUser(req);
    const { orgId } = user;
    const next = orgSettingsSchema.parse(req.body);
    await db
      .update(settings)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(settings.orgId, orgId));
    const rescored = await rescoreAssets(db, orgId, next, {}, { actor: user });
    await recordEvent(db, orgId, 'settings.updated', {
      actorId: user.id,
      actorName: user.name,
      bandChanged: rescored.bandChanged,
      scoreChanged: rescored.scoreChanged,
    });
    const body: SaveSettingsResponse = { ...(await load(orgId)), rescored };
    res.json(body);
  });

  return router;
}
