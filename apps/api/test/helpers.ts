import type { UserRole } from '@pramaan/shared';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import { loadEnv } from '../src/env.js';
import { createLogger } from '../src/logger.js';
import { FakeAiClient, FakeMediaStore } from './fakes.js';

/**
 * Build the real app against the test database, with Cloudinary and Gemini replaced by
 * fakes at the service boundary. Call `close()` in afterAll.
 */
export function createTestApp(overrides: Partial<Record<string, string>> = {}) {
  const env = loadEnv({ ...process.env, ...overrides });
  const { db, pool } = createDb(env.DATABASE_URL);
  const media = new FakeMediaStore();
  const ai = new FakeAiClient();
  const app = createApp({ env, db, logger: createLogger(env), media, ai });
  return { app, db, env, media, ai, close: () => pool.end() };
}

let counter = 0;
const uniqueEmail = (prefix: string) => `${prefix}+${Date.now()}-${++counter}@example.org`;

/** Sign up a new organization; returns a signed-in admin agent. */
export async function signUp(app: Express, orgName = 'Jal Seva Trust') {
  const agent = request.agent(app);
  const email = uniqueEmail('admin');
  const res = await agent
    .post('/api/auth/signup')
    .send({ orgName, name: 'Asha Rao', email, password: 'a strong password' })
    .expect(201);
  return { agent, email, orgId: res.body.org.id as string, userId: res.body.user.id as string };
}

/** Invite a teammate with a role and sign them in; returns their agent. */
export async function addMember(
  app: Express,
  admin: ReturnType<typeof request.agent>,
  role: UserRole,
) {
  const email = uniqueEmail(role);
  const invite = await admin
    .post('/api/users/invite')
    .send({ name: `${role} person`, email, role })
    .expect(201);
  const token = new URL(invite.body.inviteUrl).searchParams.get('token');
  const agent = request.agent(app);
  await agent
    .post('/api/auth/set-password')
    .send({ token, password: 'member password' })
    .expect(200);
  return { agent, email, id: invite.body.member.id as string };
}
