import { createHash } from 'node:crypto';
import { loginInput, setPasswordInput, signupInput } from '@pramaan/shared';
import { and, eq, gt } from 'drizzle-orm';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../auth/password.js';
import {
  clearSessionCookie,
  setSessionCookie,
  toSessionResponse,
  type SessionUser,
} from '../auth/session.js';
import type { Db } from '../db/client.js';
import { isUniqueViolation } from '../db/errors.js';
import { organizations, users } from '../db/schema.js';
import type { Env } from '../env.js';
import { HttpError } from '../http-error.js';
import { createDefaultSettings } from '../services/settings.js';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const EMAIL_TAKEN = 'An account with this email already exists';

export function authRouter(db: Db, env: Env) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
    limit: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
  });

  async function loadSessionUser(userId: string): Promise<SessionUser> {
    const [row] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        orgId: users.orgId,
        orgName: organizations.name,
      })
      .from(users)
      .innerJoin(organizations, eq(organizations.id, users.orgId))
      .where(eq(users.id, userId));
    if (!row) throw new HttpError(404, 'User not found');
    return row;
  }

  /** Sign-up creates a new organization, seeds its settings, and makes the user its admin. */
  router.post('/signup', limiter, async (req, res) => {
    const input = signupInput.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    try {
      const userId = await db.transaction(async (tx) => {
        const [org] = await tx.insert(organizations).values({ name: input.orgName }).returning();
        await createDefaultSettings(tx, org!.id);
        const [user] = await tx
          .insert(users)
          .values({
            orgId: org!.id,
            name: input.name,
            email: input.email,
            passwordHash,
            role: 'admin',
          })
          .returning({ id: users.id });
        return user!.id;
      });
      setSessionCookie(res, userId, env);
      res.status(201).json(toSessionResponse(await loadSessionUser(userId)));
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, EMAIL_TAKEN);
      throw err;
    }
  });

  router.post('/login', limiter, async (req, res) => {
    const input = loginInput.parse(req.body);
    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, input.email));
    // Always run one hash comparison so response time doesn't reveal which emails exist.
    const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user?.passwordHash || !ok) {
      throw new HttpError(401, 'That email and password combination is not right');
    }
    setSessionCookie(res, user.id, env);
    res.json(toSessionResponse(await loadSessionUser(user.id)));
  });

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res, env);
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json(toSessionResponse(currentUser(req)));
  });

  /** Invited users choose their password with the one-time token from their invite link. */
  router.post('/set-password', limiter, async (req, res) => {
    const input = setPasswordInput.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    const [user] = await db
      .update(users)
      .set({ passwordHash, inviteTokenHash: null, inviteExpiresAt: null })
      .where(
        and(
          eq(users.inviteTokenHash, hashToken(input.token)),
          gt(users.inviteExpiresAt, new Date()),
        ),
      )
      .returning({ id: users.id });
    if (!user) {
      throw new HttpError(
        400,
        'This link is invalid or has expired. Ask your admin for a new one.',
      );
    }
    setSessionCookie(res, user.id, env);
    res.json(toSessionResponse(await loadSessionUser(user.id)));
  });

  return router;
}

export { EMAIL_TAKEN };
