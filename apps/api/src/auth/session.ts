import type { SessionResponse, UserRole } from '@pramaan/shared';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Env } from '../env.js';

export const SESSION_COOKIE = 'pramaan_session';

type SessionEnv = Pick<Env, 'JWT_SECRET' | 'SESSION_TTL_DAYS' | 'NODE_ENV'>;

/** The signed-in user, loaded fresh from the database on every request. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  orgId: string;
  orgName: string;
}

export function toSessionResponse(user: SessionUser): SessionResponse {
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    org: { id: user.orgId, name: user.orgName },
  };
}

/** The token carries only the user id; role and org are re-read on each request. */
export function signSession(userId: string, env: SessionEnv): string {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn: `${env.SESSION_TTL_DAYS}d`,
  });
}

export function verifySession(token: string, env: SessionEnv): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function cookieOptions(env: SessionEnv) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
  };
}

export function setSessionCookie(res: Response, userId: string, env: SessionEnv) {
  res.cookie(SESSION_COOKIE, signSession(userId, env), {
    ...cookieOptions(env),
    maxAge: env.SESSION_TTL_DAYS * 86_400_000,
  });
}

export function clearSessionCookie(res: Response, env: SessionEnv) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(env));
}
