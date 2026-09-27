import { randomBytes } from 'node:crypto';
import {
  inviteInput,
  roleUpdateInput,
  type InviteResponse,
  type TeamMember,
} from '@pramaan/shared';
import { and, asc, count, eq, isNull, ne } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireRole } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
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

  /** A current (not removed) member of the admin's organization, or 404. */
  async function requireMember(orgId: string, id: unknown) {
    const parsed = z.uuid().safeParse(id);
    const [user] = parsed.success
      ? await db
          .select()
          .from(users)
          .where(
            and(eq(users.id, parsed.data), eq(users.orgId, orgId), isNull(users.deactivatedAt)),
          )
      : [];
    if (!user) throw new HttpError(404, 'Team member not found');
    return user;
  }

  async function otherAdmins(orgId: string, exceptId: string) {
    const [row] = await db
      .select({ n: count() })
      .from(users)
      .where(
        and(
          eq(users.orgId, orgId),
          eq(users.role, 'admin'),
          ne(users.id, exceptId),
          isNull(users.deactivatedAt),
        ),
      );
    return row!.n;
  }

  router.get('/', async (req, res) => {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.orgId, currentUser(req).orgId), isNull(users.deactivatedAt)))
      .orderBy(asc(users.createdAt));
    res.json({ members: rows.map(toMember) });
  });

  /**
   * Invite a teammate. The password-set link is logged on the server (the demo has no
   * email sending) and returned so the admin can copy it. Re-inviting someone who was
   * removed from this organization restores them with the new role.
   */
  router.post('/invite', async (req, res) => {
    const admin = currentUser(req);
    const input = inviteInput.parse(req.body);
    const token = randomBytes(32).toString('base64url');
    const invite = {
      name: input.name,
      role: input.role,
      passwordHash: null,
      inviteTokenHash: hashToken(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
      deactivatedAt: null,
    };

    const [existing] = await db.select().from(users).where(eq(users.email, input.email));
    if (existing && (existing.orgId !== admin.orgId || !existing.deactivatedAt)) {
      throw new HttpError(409, EMAIL_TAKEN);
    }
    const [row] = existing
      ? await db.update(users).set(invite).where(eq(users.id, existing.id)).returning()
      : await db
          .insert(users)
          .values({ ...invite, orgId: admin.orgId, email: input.email })
          .returning();

    const inviteUrl = `${req.protocol}://${req.get('host')}/set-password?token=${token}`;
    req.log.info({ email: input.email, role: input.role, inviteUrl }, 'Invite link created');
    const body: InviteResponse = { member: toMember(row!), inviteUrl };
    res.status(201).json(body);
  });

  router.put('/:id/role', async (req, res) => {
    const { orgId } = currentUser(req);
    const member = await requireMember(orgId, req.params.id);
    const { role } = roleUpdateInput.parse(req.body);
    if (
      member.role === 'admin' &&
      role !== 'admin' &&
      (await otherAdmins(orgId, member.id)) === 0
    ) {
      throw new HttpError(409, 'Your organisation needs at least one admin.');
    }
    const [row] = await db.update(users).set({ role }).where(eq(users.id, member.id)).returning();
    res.json(toMember(row!));
  });

  /** Remove someone from the team. They can no longer sign in; their review history stays. */
  router.delete('/:id', async (req, res) => {
    const me = currentUser(req);
    const member = await requireMember(me.orgId, req.params.id);
    if (member.id === me.id) {
      throw new HttpError(409, 'You can’t remove yourself. Ask another admin to do it.');
    }
    await db
      .update(users)
      .set({ deactivatedAt: new Date(), inviteTokenHash: null, inviteExpiresAt: null })
      .where(eq(users.id, member.id));
    res.status(204).end();
  });

  return router;
}
