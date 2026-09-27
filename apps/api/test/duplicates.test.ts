import {
  computeTrustScore,
  DEFAULT_ORG_SETTINGS,
  phashFromHex,
  type ScoringAsset,
} from '@pramaan/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client.js';
import { findDuplicateCandidates } from '../src/services/duplicates.js';
import { createAsset, createOrg, createProject, resetDb } from './fixtures.js';
import { TEST_DATABASE_URL } from './test-db-url.js';

const { db, pool } = createDb(TEST_DATABASE_URL);
afterAll(() => pool.end());

const BASE = phashFromHex('ba19c8ab5fa05a59')!;
/** Flip the first `n` bits. */
const flip = (bits: string, n: number) =>
  [...bits].map((b, i) => (i < n ? (b === '0' ? '1' : '0') : b)).join('');

let org: Awaited<ReturnType<typeof createOrg>>;
let phase1: Awaited<ReturnType<typeof createProject>>;
let phase2: Awaited<ReturnType<typeof createProject>>;

beforeEach(async () => {
  await resetDb(db);
  org = await createOrg(db);
  phase1 = await createProject(db, org.id, { name: 'Borewell Project – Phase 1' });
  phase2 = await createProject(db, org.id, { name: 'Borewell Project – Phase 2' });
});

const query = (overrides: Partial<Parameters<typeof findDuplicateCandidates>[1]> = {}) =>
  findDuplicateCandidates(db, {
    orgId: org.id,
    projectId: phase2.id,
    assetId: null,
    etag: 'new-etag',
    phash: BASE,
    phashThreshold: 6,
    ...overrides,
  });

describe('findDuplicateCandidates', () => {
  it('finds pHash matches within the threshold in other projects, using SQL bit_count', async () => {
    const at3 = await createAsset(db, phase1, { phash: flip(BASE, 3) });
    const at6 = await createAsset(db, phase1, { phash: flip(BASE, 6) });
    await createAsset(db, phase1, { phash: flip(BASE, 7) });
    await createAsset(db, phase1, { phash: null });

    const found = await query();
    expect(found.map((c) => c.id).sort()).toEqual([at3.id, at6.id].sort());
    expect(found.find((c) => c.id === at3.id)).toMatchObject({
      projectId: phase1.id,
      projectName: 'Borewell Project – Phase 1',
      phash: flip(BASE, 3),
    });
  });

  it('respects the configured threshold', async () => {
    await createAsset(db, phase1, { phash: flip(BASE, 3) });
    expect(await query({ phashThreshold: 2 })).toHaveLength(0);
    expect(await query({ phashThreshold: 3 })).toHaveLength(1);
  });

  it('ignores near matches inside the same project', async () => {
    await createAsset(db, phase2, { phash: flip(BASE, 1) });
    expect(await query()).toHaveLength(0);
  });

  it('finds exact etag matches in any project, including the same one', async () => {
    const same = await createAsset(db, phase2, { etag: 'dup', phash: flip(BASE, 40) });
    const other = await createAsset(db, phase1, { etag: 'dup', phash: null });
    const found = await query({ etag: 'dup' });
    expect(found.map((c) => c.id).sort()).toEqual([same.id, other.id].sort());
  });

  it('matches files without a pHash (videos) by etag only', async () => {
    const video = await createAsset(db, phase1, {
      etag: 'vid',
      phash: null,
      resourceType: 'video',
    });
    await createAsset(db, phase1, { phash: BASE });
    const found = await query({ etag: 'vid', phash: null });
    expect(found.map((c) => c.id)).toEqual([video.id]);
  });

  it('excludes the asset itself', async () => {
    const self = await createAsset(db, phase2, { etag: 'dup', phash: BASE });
    expect(await query({ assetId: self.id, etag: 'dup' })).toHaveLength(0);
  });

  it('never looks outside the organization', async () => {
    const otherOrg = await createOrg(db, 'Another NGO');
    const theirs = await createProject(db, otherOrg.id);
    await createAsset(db, theirs, { etag: 'new-etag', phash: BASE });
    expect(await query()).toHaveLength(0);
  });

  it('feeds computeTrustScore end to end', async () => {
    await createAsset(db, phase1, { phash: flip(BASE, 3) });
    const asset: ScoringAsset = {
      id: 'new',
      projectId: phase2.id,
      etag: 'new-etag',
      phash: BASE,
      capturedAt: new Date('2024-03-10T00:00:00Z'),
      uploadedAt: new Date('2024-03-11T00:00:00Z'),
      lat: null,
      lng: null,
    };
    const result = computeTrustScore(
      asset,
      await query(),
      { id: phase2.id, name: phase2.name, startDate: new Date('2024-01-01Z'), endDate: null },
      null,
      DEFAULT_ORG_SETTINGS,
    );
    const near = result.checks.find((c) => c.type === 'near_duplicate');
    expect(near?.reason).toBe(
      'Near-copy of an asset in Borewell Project – Phase 1 (distance 3/64)',
    );
    // 40 near-duplicate + 15 missing GPS.
    expect(result.score).toBe(45);
  });
});
