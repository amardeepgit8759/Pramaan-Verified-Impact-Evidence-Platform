import {
  DEFAULT_ORG_SETTINGS,
  phashFromHex,
  rescoreSummarySchema,
  saveSettingsResponse,
  settingsResponse,
  siteListResponse,
  siteSchema,
  teamListResponse,
} from '@pramaan/shared';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { assets, events, trustChecks } from '../src/db/schema.js';
import { createAsset, resetDb } from './fixtures.js';
import { addMember, createTestApp, signUp } from './helpers.js';

const { app, db, close } = createTestApp();
afterAll(close);
beforeEach(() => resetDb(db));

const project = {
  name: 'Borewell Project – Phase 1',
  description: '',
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  sdgGoals: [6],
  csrCategory: null,
};
const rampur = { name: 'Village Rampur', lat: 28.47, lng: 77.03, radiusM: 500 };

async function setup() {
  const admin = await signUp(app);
  const { body } = await admin.agent.post('/api/projects').send(project).expect(201);
  return { admin, projectId: body.id as string, orgId: admin.orgId };
}

async function assetRow(id: string) {
  const [row] = await db.select().from(assets).where(eq(assets.id, id));
  return row!;
}

async function check(assetId: string, type: 'wrong_location' | 'wrong_time' | 'near_duplicate') {
  const [row] = await db
    .select()
    .from(trustChecks)
    .where(and(eq(trustChecks.assetId, assetId), eq(trustChecks.checkType, type)));
  return row!;
}

/** An asset with full, in-range metadata at Village Rampur. */
const goodMetadata = {
  capturedAt: new Date('2024-03-10T09:00:00Z'),
  uploadedAt: new Date('2024-03-11T09:00:00Z'),
  lat: 28.4702,
  lng: 77.0301,
};

describe('settings', () => {
  it('lets everyone read how scores are calculated, but only admins change it', async () => {
    const { admin } = await setup();
    const viewer = await addMember(app, admin.agent, 'viewer');
    const res = await viewer.agent.get('/api/settings').expect(200);
    expect(settingsResponse.parse(res.body).settings).toEqual(DEFAULT_ORG_SETTINGS);

    await viewer.agent.put('/api/settings').send(DEFAULT_ORG_SETTINGS).expect(403);
    await viewer.agent.post('/api/settings/preview').send(DEFAULT_ORG_SETTINGS).expect(403);
  });

  it('previews band changes without saving anything', async () => {
    const { admin, projectId, orgId } = await setup();
    // No GPS or capture date: only missing_metadata fails (−15 → 85, verified).
    const asset = await createAsset(db, { id: projectId, orgId });
    const proposed = {
      ...DEFAULT_ORG_SETTINGS,
      weights: { ...DEFAULT_ORG_SETTINGS.weights, missing_metadata: 40 },
    };
    const res = await admin.agent.post('/api/settings/preview').send(proposed).expect(200);
    expect(rescoreSummarySchema.parse(res.body)).toEqual({
      total: 1,
      scoreChanged: 1,
      bandChanged: 1,
      transitions: [{ from: 'verified', to: 'review', count: 1 }],
    });
    expect(await assetRow(asset.id)).toMatchObject({ trustScore: 100, trustBand: 'verified' });
  });

  it('saves, re-scores every asset, stores its checks and logs events', async () => {
    const { admin, projectId, orgId } = await setup();
    const asset = await createAsset(db, { id: projectId, orgId });
    const next = {
      ...DEFAULT_ORG_SETTINGS,
      weights: { ...DEFAULT_ORG_SETTINGS.weights, missing_metadata: 40 },
    };
    const res = await admin.agent.put('/api/settings').send(next).expect(200);
    const body = saveSettingsResponse.parse(res.body);
    expect(body.settings.weights.missing_metadata).toBe(40);
    expect(body.rescored.bandChanged).toBe(1);

    expect(await assetRow(asset.id)).toMatchObject({ trustScore: 60, trustBand: 'review' });
    const checks = await db.select().from(trustChecks).where(eq(trustChecks.assetId, asset.id));
    expect(checks).toHaveLength(6);

    const types = (await db.select().from(events).where(eq(events.orgId, orgId))).map(
      (e) => e.type,
    );
    expect(types).toEqual(expect.arrayContaining(['asset.rescored', 'settings.updated']));

    const reread = await admin.agent.get('/api/settings').expect(200);
    expect(reread.body.settings.weights.missing_metadata).toBe(40);
  });

  it('rejects band cut-offs in the wrong order', async () => {
    const { admin } = await setup();
    const res = await admin.agent
      .put('/api/settings')
      .send({ ...DEFAULT_ORG_SETTINGS, bandVerifiedMin: 40, bandReviewMin: 60 })
      .expect(400);
    expect(res.body.details[0].path).toEqual(['bandVerifiedMin']);
  });
});

describe('sites', () => {
  it('supports create, list, edit and delete for admins', async () => {
    const { admin, projectId } = await setup();
    const created = siteSchema.parse(
      (await admin.agent.post(`/api/projects/${projectId}/sites`).send(rampur).expect(201)).body,
    );
    expect(created).toMatchObject({ ...rampur, projectId, assetCount: 0 });

    const list = siteListResponse.parse(
      (await admin.agent.get(`/api/projects/${projectId}/sites`).expect(200)).body,
    );
    expect(list.sites.map((s) => s.name)).toEqual(['Village Rampur']);

    const edited = await admin.agent
      .put(`/api/sites/${created.id}`)
      .send({ ...rampur, name: 'Rampur (north)', radiusM: 800 })
      .expect(200);
    expect(edited.body).toMatchObject({ name: 'Rampur (north)', radiusM: 800 });

    await admin.agent.delete(`/api/sites/${created.id}`).expect(204);
    expect((await admin.agent.get(`/api/projects/${projectId}/sites`)).body.sites).toEqual([]);
  });

  it('validates coordinates and radius', async () => {
    const { admin, projectId } = await setup();
    const res = await admin.agent
      .post(`/api/projects/${projectId}/sites`)
      .send({ name: 'Bad', lat: 95, lng: 200, radiusM: 5 })
      .expect(400);
    const fields = res.body.details.map((d: { path: string[] }) => d.path[0]);
    expect(fields).toEqual(expect.arrayContaining(['lat', 'lng', 'radiusM']));
  });

  it('lets field staff and viewers list sites but not change them', async () => {
    const { admin, projectId } = await setup();
    const { body: site } = await admin.agent.post(`/api/projects/${projectId}/sites`).send(rampur);
    for (const role of ['field', 'viewer'] as const) {
      const member = await addMember(app, admin.agent, role);
      await member.agent.get(`/api/projects/${projectId}/sites`).expect(200);
      await member.agent.post(`/api/projects/${projectId}/sites`).send(rampur).expect(403);
      await member.agent.put(`/api/sites/${site.id}`).send(rampur).expect(403);
      await member.agent.delete(`/api/sites/${site.id}`).expect(403);
    }
  });

  it('hides other organisations’ sites', async () => {
    const { admin, projectId } = await setup();
    const { body: site } = await admin.agent.post(`/api/projects/${projectId}/sites`).send(rampur);
    const other = await signUp(app, 'Other NGO');
    await other.agent.get(`/api/projects/${projectId}/sites`).expect(404);
    await other.agent.put(`/api/sites/${site.id}`).send(rampur).expect(404);
    await other.agent.delete(`/api/sites/${site.id}`).expect(404);
    await other.agent.put('/api/sites/not-a-uuid').send(rampur).expect(404);
  });

  it('re-scores evidence when a site moves', async () => {
    const { admin, projectId, orgId } = await setup();
    const { body: site } = await admin.agent.post(`/api/projects/${projectId}/sites`).send(rampur);
    const asset = await createAsset(
      db,
      { id: projectId, orgId },
      { ...goodMetadata, siteId: site.id },
    );

    // Move the site ~41 km north: far beyond 10× its radius.
    await admin.agent
      .put(`/api/sites/${site.id}`)
      .send({ ...rampur, lat: 28.84 })
      .expect(200);
    expect(await assetRow(asset.id)).toMatchObject({ trustScore: 60, trustBand: 'review' });
    expect((await check(asset.id, 'wrong_location')).reason).toMatch(
      /^Taken 41\.\d km from Village Rampur/,
    );
  });

  it('keeps evidence when a site is deleted, unassigned and re-scored', async () => {
    const { admin, projectId, orgId } = await setup();
    const { body: site } = await admin.agent.post(`/api/projects/${projectId}/sites`).send(rampur);
    const asset = await createAsset(
      db,
      { id: projectId, orgId },
      { ...goodMetadata, siteId: site.id },
    );

    await admin.agent.delete(`/api/sites/${site.id}`).expect(204);
    expect(await assetRow(asset.id)).toMatchObject({ siteId: null, trustScore: 100 });
    expect((await check(asset.id, 'wrong_location')).reason).toBe('Not checked: no site assigned');
  });
});

describe('projects: edit and delete', () => {
  it('re-scores the project’s evidence when its dates change', async () => {
    const { admin, projectId, orgId } = await setup();
    const asset = await createAsset(db, { id: projectId, orgId }, goodMetadata);

    const res = await admin.agent
      .put(`/api/projects/${projectId}`)
      .send({ ...project, startDate: '2024-06-01', status: 'active' })
      .expect(200);
    expect(res.body.startDate).toBe('2024-06-01');
    expect((await check(asset.id, 'wrong_time')).reason).toBe(
      'Captured 10 Mar 2024, before the project started on 1 Jun 2024',
    );
    expect((await assetRow(asset.id)).trustScore).toBe(80);
  });

  it('keeps duplicate reasons in other projects accurate on rename and delete', async () => {
    const { admin, projectId: phase1, orgId } = await setup();
    const { body: p2 } = await admin.agent
      .post('/api/projects')
      .send({ ...project, name: 'Borewell Project – Phase 2' });
    const hash = phashFromHex('ba19c8ab5fa05a59')!;
    await createAsset(db, { id: phase1, orgId }, { ...goodMetadata, phash: hash });
    const copy = await createAsset(db, { id: p2.id, orgId }, { ...goodMetadata, phash: hash });
    // Score everything once so the copy's near-duplicate check points at Phase 1.
    await admin.agent.put('/api/settings').send(DEFAULT_ORG_SETTINGS).expect(200);
    expect((await check(copy.id, 'near_duplicate')).reason).toMatch(/Borewell Project – Phase 1/);

    await admin.agent
      .put(`/api/projects/${phase1}`)
      .send({ ...project, name: 'Borewells 2024', status: 'active' })
      .expect(200);
    expect((await check(copy.id, 'near_duplicate')).reason).toBe(
      'Near-copy of an asset in Borewells 2024 (distance 0/64)',
    );

    await admin.agent.delete(`/api/projects/${phase1}`).expect(204);
    expect((await check(copy.id, 'near_duplicate')).passed).toBe(true);
    await admin.agent.get(`/api/projects/${phase1}`).expect(404);
  });

  it('only lets admins edit or delete', async () => {
    const { admin, projectId } = await setup();
    const field = await addMember(app, admin.agent, 'field');
    await field.agent
      .put(`/api/projects/${projectId}`)
      .send({ ...project, status: 'completed' })
      .expect(403);
    await field.agent.delete(`/api/projects/${projectId}`).expect(403);
  });
});

describe('team management', () => {
  it('changes roles but always keeps one admin', async () => {
    const admin = await signUp(app);
    const field = await addMember(app, admin.agent, 'field');
    const promoted = await admin.agent
      .put(`/api/users/${field.id}/role`)
      .send({ role: 'admin' })
      .expect(200);
    expect(promoted.body.role).toBe('admin');

    // Two admins: the original can step down. Then the last one can't.
    await admin.agent.put(`/api/users/${admin.userId}/role`).send({ role: 'viewer' }).expect(200);
    await field.agent.put(`/api/users/${field.id}/role`).send({ role: 'viewer' }).expect(409);
  });

  it('removes a member, who can then no longer sign in or use their session', async () => {
    const admin = await signUp(app);
    const field = await addMember(app, admin.agent, 'field');
    await admin.agent.delete(`/api/users/${field.id}`).expect(204);

    await field.agent.get('/api/auth/me').expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: field.email, password: 'member password' })
      .expect(401);
    const team = teamListResponse.parse((await admin.agent.get('/api/users')).body);
    expect(team.members.map((m) => m.id)).not.toContain(field.id);
  });

  it('won’t let admins remove themselves', async () => {
    const admin = await signUp(app);
    await admin.agent.delete(`/api/users/${admin.userId}`).expect(409);
  });

  it('restores a removed member when they are invited again', async () => {
    const admin = await signUp(app);
    const field = await addMember(app, admin.agent, 'field');
    await admin.agent.delete(`/api/users/${field.id}`).expect(204);
    const again = await admin.agent
      .post('/api/users/invite')
      .send({ name: 'Back again', email: field.email, role: 'viewer' })
      .expect(201);
    expect(again.body.member).toMatchObject({ id: field.id, role: 'viewer', status: 'invited' });
  });

  it('refuses to invite someone who belongs to another organisation', async () => {
    const a = await signUp(app, 'Org A');
    const b = await signUp(app, 'Org B');
    await b.agent
      .post('/api/users/invite')
      .send({ name: 'Taken', email: a.email, role: 'field' })
      .expect(409);
  });
});

describe('organisation', () => {
  it('lets an admin rename it', async () => {
    const admin = await signUp(app);
    await admin.agent.put('/api/org').send({ name: 'Jal Seva Foundation' }).expect(200);
    const me = await admin.agent.get('/api/auth/me');
    expect(me.body.org.name).toBe('Jal Seva Foundation');

    const viewer = await addMember(app, admin.agent, 'viewer');
    await viewer.agent.put('/api/org').send({ name: 'Nope' }).expect(403);
  });
});
