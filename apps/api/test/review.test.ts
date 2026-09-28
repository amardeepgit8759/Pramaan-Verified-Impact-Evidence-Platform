import { assetDetailSchema, metricsSchema } from '@pramaan/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { events, reviews } from '../src/db/schema.js';
import { resetDb } from './fixtures.js';
import { addMember, createTestApp, signUp } from './helpers.js';

const t = createTestApp();
afterAll(t.close);

let admin: Awaited<ReturnType<typeof signUp>>;
let flaggedId: string;
let originalId: string;

/** Two projects; the same file uploaded to both, so the second copy is flagged. */
beforeEach(async () => {
  await resetDb(t.db);
  t.media.resources.clear();
  admin = await signUp(t.app);
  const make = async (name: string) =>
    (
      await admin.agent
        .post('/api/projects')
        .send({ name, startDate: '2024-01-01', endDate: '2024-12-31' })
        .expect(201)
    ).body.id as string;
  const [p1, p2] = [await make('Phase 1'), await make('Phase 2')];
  const exif = {
    DateTimeOriginal: '2024:03:10 09:00:00',
    GPSLatitude: '28.47',
    GPSLongitude: '77.03',
  };
  const confirm = async (projectId: string, name: string) => {
    const publicId = `pramaan/${admin.orgId}/${projectId}/${name}`;
    t.media.addUpload({
      publicId,
      etag: 'same-file',
      metadata: exif,
      createdAt: new Date('2024-03-11Z'),
    });
    return (await admin.agent.post('/api/assets/confirm').send({ publicId, projectId }).expect(201))
      .body.id as string;
  };
  originalId = await confirm(p1, 'a.jpg');
  flaggedId = await confirm(p2, 'b.jpg');
});

describe('POST /api/assets/:id/review', () => {
  it('approves flagged evidence with a note, keeping its score, and logs it', async () => {
    const before = assetDetailSchema.parse(
      (await admin.agent.get(`/api/assets/${flaggedId}`)).body,
    );
    expect(before.trustBand).toBe('flagged');
    // The duplicate check links to the asset it matched.
    expect(before.matches[originalId]).toMatchObject({ projectName: 'Phase 1' });

    const res = await admin.agent
      .post(`/api/assets/${flaggedId}/review`)
      .send({
        decision: 'approve',
        note: 'Same borewell photographed for both phases, confirmed by site visit.',
      })
      .expect(200);
    const after = assetDetailSchema.parse(res.body);
    expect(after).toMatchObject({
      reviewDecision: 'approve',
      trustBand: 'flagged',
      trustScore: before.trustScore,
    });
    expect(after.reviews).toEqual([
      expect.objectContaining({
        decision: 'approve',
        reviewerName: 'Asha Rao',
        trustScoreAtReview: before.trustScore,
      }),
    ]);

    const [logged] = await t.db.select().from(events).where(eq(events.type, 'asset.reviewed'));
    expect(logged?.payload).toMatchObject({
      assetId: flaggedId,
      decision: 'approve',
      projectName: 'Phase 2',
    });
  });

  it('keeps every decision: a later rejection is appended, not overwritten', async () => {
    await admin.agent
      .post(`/api/assets/${flaggedId}/review`)
      .send({ decision: 'approve', note: 'Looks fine' })
      .expect(200);
    const res = await admin.agent
      .post(`/api/assets/${flaggedId}/review`)
      .send({ decision: 'reject', note: 'On second look, reused from 2023' })
      .expect(200);
    expect(res.body.reviewDecision).toBe('reject');
    expect(res.body.reviews.map((r: { decision: string }) => r.decision)).toEqual([
      'reject',
      'approve',
    ]);
    expect(await t.db.select().from(reviews)).toHaveLength(2);
  });

  it('makes approved evidence count as verified for gaps and metrics queues', async () => {
    const queueBefore = metricsSchema.parse(
      (await admin.agent.get('/api/metrics')).body,
    ).needsReview;
    await admin.agent
      .post(`/api/assets/${flaggedId}/review`)
      .send({ decision: 'approve', note: 'Confirmed' })
      .expect(200);
    const queueAfter = metricsSchema.parse(
      (await admin.agent.get('/api/metrics')).body,
    ).needsReview;
    expect(queueAfter).toBe(queueBefore - 1);
  });

  it('requires a note, an admin, and evidence that isn’t already verified', async () => {
    const noNote = await admin.agent
      .post(`/api/assets/${flaggedId}/review`)
      .send({ decision: 'approve', note: ' ' })
      .expect(400);
    expect(noNote.body.details[0].message).toBe('Add a short note explaining the decision');

    const field = await addMember(t.app, admin.agent, 'field');
    await field.agent
      .post(`/api/assets/${flaggedId}/review`)
      .send({ decision: 'approve', note: 'Looks fine' })
      .expect(403);

    // Make one verified by removing the other copy's project, then try to review it.
    const detail = assetDetailSchema.parse(
      (await admin.agent.get(`/api/assets/${originalId}`)).body,
    );
    await admin.agent.delete(`/api/projects/${detail.matches[flaggedId]!.projectId}`).expect(204);
    const verified = assetDetailSchema.parse(
      (await admin.agent.get(`/api/assets/${originalId}`)).body,
    );
    expect(verified.trustBand).toBe('verified');
    await admin.agent
      .post(`/api/assets/${originalId}/review`)
      .send({ decision: 'approve', note: 'Nothing to review' })
      .expect(409);
  });

  it('hides other organisations’ evidence', async () => {
    const other = await signUp(t.app, 'Other NGO');
    await other.agent
      .post(`/api/assets/${flaggedId}/review`)
      .send({ decision: 'approve', note: 'Not mine' })
      .expect(404);
  });
});
