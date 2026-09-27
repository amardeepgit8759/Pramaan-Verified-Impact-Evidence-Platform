import { orgUpdateInput } from '@pramaan/shared';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { currentUser, requireRole } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
import { organizations } from '../db/schema.js';

export function orgRouter(db: Db) {
  const router = Router();

  router.put('/', requireRole('admin'), async (req, res) => {
    const { name } = orgUpdateInput.parse(req.body);
    const [org] = await db
      .update(organizations)
      .set({ name })
      .where(eq(organizations.id, currentUser(req).orgId))
      .returning({ id: organizations.id, name: organizations.name });
    res.json(org);
  });

  return router;
}
