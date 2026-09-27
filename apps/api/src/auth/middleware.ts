import type { UserRole } from '@pramaan/shared';
import { eq } from 'drizzle-orm';
import type { Request, RequestHandler } from 'express';
import type { Db } from '../db/client.js';
import { organizations, users } from '../db/schema.js';
import type { Env } from '../env.js';
import { HttpError } from '../http-error.js';
import { SESSION_COOKIE, verifySession, type SessionUser } from './session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/** Attach `req.user` when a valid session cookie is present; never rejects on its own. */
export function authenticate(db: Db, env: Env): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const userId = typeof token === 'string' ? verifySession(token, env) : null;
    if (!userId) return next();

    const [row] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        orgId: users.orgId,
        orgName: organizations.name,
        passwordHash: users.passwordHash,
        deactivatedAt: users.deactivatedAt,
      })
      .from(users)
      .innerJoin(organizations, eq(organizations.id, users.orgId))
      .where(eq(users.id, userId));

    // A user removed (or reset to invited) since the cookie was issued is signed out.
    if (row?.passwordHash && !row.deactivatedAt) {
      const { passwordHash: _hash, deactivatedAt: _removed, ...user } = row;
      req.user = user;
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Please sign in to continue'));
  next();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'Please sign in to continue'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, "Your role doesn't allow this action"));
    }
    next();
  };
}

/** The signed-in user in a handler that sits behind `requireAuth`. */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, 'Please sign in to continue');
  return req.user;
}
