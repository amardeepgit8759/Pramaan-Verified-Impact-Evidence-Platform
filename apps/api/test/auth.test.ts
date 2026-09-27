import { inviteResponse, sessionResponse } from '@pramaan/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { settings, users } from '../src/db/schema.js';
import { resetDb } from './fixtures.js';
import { createTestApp } from './helpers.js';

const { app, db, close } = createTestApp();
afterAll(close);
beforeEach(() => resetDb(db));

const signup = {
  orgName: 'Jal Seva Trust',
  name: 'Asha Rao',
  email: 'Asha@Example.org ',
  password: 'correct horse battery',
};

async function signedInAdmin() {
  const agent = request.agent(app);
  await agent.post('/api/auth/signup').send(signup).expect(201);
  return agent;
}

describe('sign-up', () => {
  it('creates an organization, seeds its settings, and signs the admin in', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/signup').send(signup).expect(201);
    const body = sessionResponse.parse(res.body);
    expect(body.user).toMatchObject({ name: 'Asha Rao', email: 'asha@example.org', role: 'admin' });
    expect(body.org.name).toBe('Jal Seva Trust');

    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^pramaan_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const [seeded] = await db.select().from(settings).where(eq(settings.orgId, body.org.id));
    expect(seeded?.phashThreshold).toBe(6);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toEqual(body);
  });

  it('stores a scrypt hash, never the password', async () => {
    await request(app).post('/api/auth/signup').send(signup).expect(201);
    const [user] = await db.select().from(users);
    expect(user?.passwordHash).toMatch(/^scrypt\$/);
    expect(user?.passwordHash).not.toContain(signup.password);
  });

  it('rejects a duplicate email', async () => {
    await request(app).post('/api/auth/signup').send(signup).expect(201);
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ ...signup, email: 'asha@example.org' })
      .expect(409);
    expect(res.body.error).toBe('An account with this email already exists');
  });

  it('validates input with field-level details', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ ...signup, email: 'nope', password: 'short' })
      .expect(400);
    const paths = res.body.details.map((d: { path: string[] }) => d.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['email', 'password']));
  });
});

describe('sign-in and sign-out', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/signup').send(signup).expect(201);
  });

  it('signs in with the right password, case-insensitively on email', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'ASHA@example.org', password: signup.password })
      .expect(200);
    await agent.get('/api/auth/me').expect(200);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'asha@example.org', password: 'wrong password' })
      .expect(401);
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.org', password: 'wrong password' })
      .expect(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  it('signs out by clearing the cookie', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: 'asha@example.org', password: signup.password });
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('ignores tampered or foreign tokens', async () => {
    await request(app).get('/api/auth/me').set('Cookie', 'pramaan_session=not-a-jwt').expect(401);
  });
});

describe('invites and roles', () => {
  it('lets an admin invite a teammate who then sets a password', async () => {
    const admin = await signedInAdmin();
    const res = await admin
      .post('/api/users/invite')
      .send({ name: 'Ravi Kumar', email: 'ravi@example.org', role: 'field' })
      .expect(201);
    const { member, inviteUrl } = inviteResponse.parse(res.body);
    expect(member).toMatchObject({ role: 'field', status: 'invited' });

    // An invited user can't sign in before choosing a password.
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'ravi@example.org', password: 'anything' })
      .expect(401);

    const token = new URL(inviteUrl).searchParams.get('token');
    const ravi = request.agent(app);
    const set = await ravi
      .post('/api/auth/set-password')
      .send({ token, password: 'a brand new password' })
      .expect(200);
    expect(set.body.user).toMatchObject({ email: 'ravi@example.org', role: 'field' });
    await ravi.get('/api/auth/me').expect(200);

    // The token is single-use.
    await request(app)
      .post('/api/auth/set-password')
      .send({ token, password: 'another password' })
      .expect(400);

    const team = await admin.get('/api/users').expect(200);
    expect(team.body.members.map((m: { status: string }) => m.status)).toEqual([
      'active',
      'active',
    ]);
  });

  it('rejects expired invite links', async () => {
    const admin = await signedInAdmin();
    const res = await admin
      .post('/api/users/invite')
      .send({ name: 'Ravi', email: 'ravi@example.org', role: 'viewer' })
      .expect(201);
    await db
      .update(users)
      .set({ inviteExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(users.email, 'ravi@example.org'));
    const token = new URL(res.body.inviteUrl).searchParams.get('token');
    const err = await request(app)
      .post('/api/auth/set-password')
      .send({ token, password: 'a brand new password' })
      .expect(400);
    expect(err.body.error).toMatch(/invalid or has expired/);
  });

  it('only lets admins manage the team', async () => {
    const admin = await signedInAdmin();
    const res = await admin
      .post('/api/users/invite')
      .send({ name: 'Field', email: 'field@example.org', role: 'field' });
    const token = new URL(res.body.inviteUrl).searchParams.get('token');
    const field = request.agent(app);
    await field.post('/api/auth/set-password').send({ token, password: 'field password' });

    await field.get('/api/users').expect(403);
    await field
      .post('/api/users/invite')
      .send({ name: 'X', email: 'x@example.org', role: 'admin' })
      .expect(403);
    await request(app).get('/api/users').expect(401);
  });

  it('signs out a user who is reset to invited', async () => {
    const admin = await signedInAdmin();
    await db.update(users).set({ passwordHash: null });
    await admin.get('/api/auth/me').expect(401);
  });
});

describe('request hygiene', () => {
  it('refuses non-JSON request bodies', async () => {
    await request(app)
      .post('/api/auth/login')
      .type('form')
      .send('email=a@b.co&password=x')
      .expect(415);
  });
});
