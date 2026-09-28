import { searchQuery } from '@pramaan/shared';
import { Router } from 'express';
import { currentUser, requireAuth } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
import type { Logger } from '../logger.js';
import { requireProject } from '../services/access.js';
import type { AiClient } from '../services/ai.js';
import type { MediaStore } from '../services/media.js';
import { searchEvidence, topTags } from '../services/search.js';

export function searchRouter(deps: { db: Db; ai: AiClient; media: MediaStore; logger: Logger }) {
  const router = Router();
  router.use(requireAuth);

  /** `GET /api/search?q=&projectId=&band=&from=&to=` */
  router.get('/', async (req, res) => {
    const { orgId } = currentUser(req);
    const input = searchQuery.parse(req.query);
    if (input.projectId) await requireProject(deps.db, orgId, input.projectId);
    res.json(await searchEvidence(deps, orgId, input));
  });

  /** The organisation's most-used tags, offered as example searches. */
  router.get('/suggestions', async (req, res) => {
    res.json({ tags: await topTags(deps.db, currentUser(req).orgId) });
  });

  return router;
}
