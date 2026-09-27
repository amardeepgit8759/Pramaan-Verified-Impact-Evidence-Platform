import { randomBytes } from 'node:crypto';
import { inviteInput, type InviteResponse, type TeamMember } from '@pramaan/shared';
import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { currentUser, requireRole } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
import { isUniqueViolation } from '../db/errors.js';
import { users } from '../db/schema.js';
import { HttpError } from '../http-error.js';
import { EMAIL_TAKEN, hashToken } from './auth.js';

const INVITE_TTL_MS = 7 * 86_400_000;

type UserRow = Pick<
  typeof users.$inferSelect,
  'id' | 'name' | 'email' | 'role' | 'passwordHash' | 'createdAt'
>;

const toMember = (u: UserRow): TeamMember => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.passwordHash ? 'active' : 'invited',
  createdAt: u.createdAt.toISOString(),
});

export function usersRouter(db: Db) {
  const router = Router();
  router.use(requireRole('admin'));

  router.get('/', async (req, res) => {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.orgId, currentUser(req).orgId))
      .orderBy(asc(users.createdAt));
    res.json({ members: rows.map(toMember) });
  });

  /**
   * Invite a teammate. The password-set link is logged on the server (the demo has no
   * email sending) and returned so the admin can copy it.
   */
  router.post('/invite', async (req, res) => {
    const admin = currentUser(req);
    const input = inviteInput.parse(req.body);
    const token = randomBytes(32).toString('base64url');
    try {
      const [row] = await db
        .insert(users)
        .values({
          orgId: admin.orgId,
          name: input.name,
          email: input.email,
          role: input.role,
          inviteTokenHash: hashToken(token),
          inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
        })
        .returning();
      const inviteUrl = `${req.protocol}://${req.get('host')}/set-password?token=${token}`;
      req.log.info({ email: input.email, role: input.role, inviteUrl }, 'Invite link created');
      const body: InviteResponse = { member: toMember(row!), inviteUrl };
      res.status(201).json(body);
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, EMAIL_TAKEN);
      throw err;
    }
  });

  return router;
}
