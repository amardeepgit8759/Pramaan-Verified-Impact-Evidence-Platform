import { describe, expect, it } from 'vitest';
import { DEFAULT_ORG_SETTINGS } from './defaults.js';
import type { CheckType } from './domain.js';
import { phashFromHex } from './phash.js';
import { orgSettingsSchema, type OrgSettings } from './settings.js';
import {
  bandFor,
  comparisonSite,
  computeTrustScore,
  type DuplicateCandidate,
  type ScoringAsset,
  type ScoringProject,
  type ScoringSite,
} from './trust.js';

const settings = DEFAULT_ORG_SETTINGS;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const PHASH = phashFromHex('ba19c8ab5fa05a59')!;
/** Flip the first `n` bits of a bit string. */
const flip = (bits: string, n: number) =>
  [...bits].map((b, i) => (i < n ? (b === '0' ? '1' : '0') : b)).join('');

const project: ScoringProject = {
  id: 'p1',
  name: 'Borewell Project – Phase 2',
  startDate: day('2024-01-01'),
  endDate: day('2024-12-31'),
};

// Village Rampur, radius 500 m.
const site: ScoringSite = {
  id: 's1',
  name: 'Village Rampur',
  lat: 28.47,
  lng: 77.03,
  radiusM: 500,
};

const cleanAsset: ScoringAsset = {
  id: 'a1',
  projectId: 'p1',
  etag: 'etag-1',
  phash: PHASH,
  capturedAt: new Date('2024-03-15T10:00:00Z'),
  uploadedAt: new Date('2024-03-16T10:00:00Z'),
  lat: 28.4705,
  lng: 77.0302,
};

const candidate = (overrides: Partial<DuplicateCandidate>): DuplicateCandidate => ({
  id: 'c1',
  projectId: 'p2',
  projectName: 'Borewell Project – Phase 1',
  etag: 'etag-other',
  phash: null,
  uploadedAt: new Date('2024-02-01T10:00:00Z'),
  ...overrides,
});

function score(
  asset: Partial<ScoringAsset> = {},
  candidates: DuplicateCandidate[] = [],
  opts: { site?: ScoringSite | null; project?: ScoringProject; settings?: OrgSettings } = {},
) {
  return computeTrustScore(
    { ...cleanAsset, ...asset },
    candidates,
    opts.project ?? project,
    opts.site === undefined ? site : opts.site,
    opts.settings ?? settings,
  );
}

function check(result: ReturnType<typeof score>, type: CheckType) {
  const found = result.checks.find((c) => c.type === type);
  if (!found) throw new Error(`missing check ${type}`);
  return found;
}

describe('default settings', () => {
  it('match the brief and pass the settings schema', () => {
    expect(orgSettingsSchema.parse(DEFAULT_ORG_SETTINGS)).toEqual(DEFAULT_ORG_SETTINGS);
    expect(DEFAULT_ORG_SETTINGS).toMatchObject({
      phashThreshold: 6,
      lateUploadDays: 90,
      gapDays: 30,
      bandVerifiedMin: 80,
      bandReviewMin: 50,
    });
  });

  it('reject band cut-offs in the wrong order', () => {
    const result = orgSettingsSchema.safeParse({
      ...DEFAULT_ORG_SETTINGS,
      bandVerifiedMin: 40,
      bandReviewMin: 60,
    });
    expect(result.success).toBe(false);
  });
});

describe('computeTrustScore', () => {
  it('gives a clean asset 100, verified, with all six checks passing', () => {
    const result = score();
    expect(result.score).toBe(100);
    expect(result.band).toBe('verified');
    expect(result.checks.map((c) => c.type)).toEqual([
      'exact_duplicate',
      'near_duplicate',
      'wrong_location',
      'wrong_time',
      'missing_metadata',
      'late_upload',
    ]);
    expect(result.checks.every((c) => c.passed && c.deduction === 0)).toBe(true);
    expect(check(result, 'exact_duplicate').reason).toBe('No exact copies found');
    expect(check(result, 'near_duplicate').reason).toBe('No near-copies in other projects');
    expect(check(result, 'wrong_location').reason).toBe(
      'Taken 59 m from Village Rampur, within its 500 m radius',
    );
    expect(check(result, 'wrong_time').reason).toBe('Captured 15 Mar 2024, during the project');
    expect(check(result, 'missing_metadata').reason).toBe(
      'GPS location and capture date are present',
    );
    expect(check(result, 'late_upload').reason).toBe('Uploaded 1 day after it was taken');
  });

  it('takes every deduction from settings', () => {
    const custom: OrgSettings = {
      ...settings,
      weights: { ...settings.weights, missing_metadata: 3, wrong_location: 7 },
    };
    const result = score({ lat: null, lng: null }, [], { settings: custom });
    expect(check(result, 'missing_metadata').deduction).toBe(3);
    expect(result.score).toBe(97);
  });

  it('clamps the score at 0 and bands it flagged', () => {
    const result = score(
      {
        lat: 30,
        lng: 80,
        capturedAt: new Date('2023-01-01T00:00:00Z'),
        uploadedAt: new Date('2024-06-01T00:00:00Z'),
      },
      [candidate({ etag: 'etag-1' })],
    );
    // 60 exact + 40 far location + 20 time + 10 late = 130 → clamped.
    expect(result.score).toBe(0);
    expect(result.band).toBe('flagged');
  });

  describe('exact_duplicate', () => {
    it('fails for the same etag in another project', () => {
      const result = score({}, [candidate({ etag: 'etag-1' })]);
      const c = check(result, 'exact_duplicate');
      expect(c).toMatchObject({ passed: false, deduction: 60 });
      expect(c.reason).toBe('Exact copy of an asset in Borewell Project – Phase 1');
      expect(c.detail).toEqual({
        matchedAssetId: 'c1',
        matchedProjectId: 'p2',
        sameProject: false,
      });
      expect(result.score).toBe(40);
      expect(result.band).toBe('flagged');
    });

    it('prefers a cross-project match over a same-project one', () => {
      const result = score({}, [
        candidate({ id: 'same', projectId: 'p1', etag: 'etag-1' }),
        candidate({ id: 'other', etag: 'etag-1' }),
      ]);
      expect(check(result, 'exact_duplicate').detail.matchedAssetId).toBe('other');
    });

    it('fails for the same etag in this project outside the burst window', () => {
      const result = score({}, [
        candidate({
          projectId: 'p1',
          etag: 'etag-1',
          uploadedAt: new Date('2024-03-01T10:00:00Z'),
        }),
      ]);
      const c = check(result, 'exact_duplicate');
      expect(c.passed).toBe(false);
      expect(c.reason).toBe('Same file was uploaded to this project 15 days apart');
      expect(c.detail).toMatchObject({ sameProject: true, daysApart: 15 });
    });

    it('treats a re-upload to the same project inside the burst window as a retry', () => {
      const result = score({}, [
        candidate({
          projectId: 'p1',
          etag: 'etag-1',
          uploadedAt: new Date('2024-03-14T10:00:00Z'),
        }),
      ]);
      const c = check(result, 'exact_duplicate');
      expect(c).toMatchObject({ passed: true, deduction: 0 });
      expect(c.reason).toBe('Re-uploaded within 7 days; treated as a retry, not a duplicate');
    });

    it('works symmetrically when re-scoring the earlier asset', () => {
      const result = score({ uploadedAt: new Date('2024-01-01T00:00:00Z') }, [
        candidate({
          projectId: 'p1',
          etag: 'etag-1',
          uploadedAt: new Date('2024-01-31T00:00:00Z'),
        }),
      ]);
      expect(check(result, 'exact_duplicate').reason).toBe(
        'Same file was uploaded to this project 30 days apart',
      );
    });

    it('ignores the asset itself among the candidates', () => {
      const self = candidate({ id: 'a1', projectId: 'p2', etag: 'etag-1' });
      expect(check(score({}, [self]), 'exact_duplicate').passed).toBe(true);
    });
  });

  describe('near_duplicate', () => {
    it('fails when a pHash in another project is within the threshold', () => {
      const result = score({}, [candidate({ phash: flip(PHASH, 3) })]);
      const c = check(result, 'near_duplicate');
      expect(c).toMatchObject({ passed: false, deduction: 40 });
      expect(c.reason).toBe('Near-copy of an asset in Borewell Project – Phase 1 (distance 3/64)');
      expect(c.detail).toEqual({
        matchedAssetId: 'c1',
        matchedProjectId: 'p2',
        hammingDistance: 3,
        threshold: 6,
      });
    });

    it('reports the closest match', () => {
      const result = score({}, [
        candidate({ id: 'far', phash: flip(PHASH, 5) }),
        candidate({ id: 'close', phash: flip(PHASH, 2) }),
        candidate({ id: 'mid', phash: flip(PHASH, 4) }),
      ]);
      expect(check(result, 'near_duplicate').detail.matchedAssetId).toBe('close');
    });

    it('passes at threshold + 1', () => {
      expect(
        check(score({}, [candidate({ phash: flip(PHASH, 7) })]), 'near_duplicate').passed,
      ).toBe(true);
      expect(
        check(score({}, [candidate({ phash: flip(PHASH, 6) })]), 'near_duplicate').passed,
      ).toBe(false);
    });

    it('ignores the same project, exact copies, candidates without a pHash, and itself', () => {
      const result = score({}, [
        candidate({ id: 'same-project', projectId: 'p1', phash: PHASH }),
        candidate({ id: 'exact', etag: 'etag-1', phash: PHASH }),
        candidate({ id: 'no-hash', phash: null }),
        candidate({ id: 'a1', phash: PHASH }),
      ]);
      expect(check(result, 'near_duplicate').passed).toBe(true);
    });

    it('is not checked for files without a pHash (e.g. videos)', () => {
      const c = check(score({ phash: null }, [candidate({ phash: PHASH })]), 'near_duplicate');
      expect(c).toMatchObject({ passed: true, deduction: 0 });
      expect(c.reason).toBe('Not checked: this file has no perceptual hash');
    });
  });

  describe('wrong_location', () => {
    it('deducts the normal amount just outside the radius', () => {
      // ~1.1 km north of the site.
      const c = check(score({ lat: 28.48, lng: 77.03 }), 'wrong_location');
      expect(c).toMatchObject({ passed: false, deduction: 25 });
      expect(c.reason).toBe('Taken 1.1 km from Village Rampur (allowed radius 500 m)');
      expect(c.detail).toMatchObject({ siteId: 's1', radiusM: 500, far: false });
    });

    it('deducts the heavier amount beyond 10× the radius', () => {
      // ~41 km away.
      const c = check(score({ lat: 28.84, lng: 77.03 }), 'wrong_location');
      expect(c).toMatchObject({ passed: false, deduction: 40 });
      expect(c.reason).toBe('Taken 41.1 km from Village Rampur (allowed radius 500 m)');
      expect(c.detail.far).toBe(true);
    });

    it('formats kilometre radii', () => {
      const bigSite = { ...site, radiusM: 2000 };
      const c = check(score({ lat: 28.5, lng: 77.03 }, [], { site: bigSite }), 'wrong_location');
      expect(c.reason).toBe('Taken 3.3 km from Village Rampur (allowed radius 2.0 km)');
    });

    it('is not checked without a site', () => {
      const c = check(score({}, [], { site: null }), 'wrong_location');
      expect(c).toMatchObject({ passed: true, reason: 'Not checked: no site assigned' });
    });

    it('says when it compared an unassigned asset with the nearest site', () => {
      const nearest = { ...site, nearest: true };
      const inside = check(score({}, [], { site: nearest }), 'wrong_location');
      expect(inside).toMatchObject({ passed: true, detail: { assigned: false } });
      expect(inside.reason).toBe(
        'Taken 59 m from the nearest site, Village Rampur, within its 500 m radius',
      );

      const outside = check(score({ lat: 28.84 }, [], { site: nearest }), 'wrong_location');
      expect(outside).toMatchObject({ passed: false, deduction: 40 });
      expect(outside.reason).toMatch(/^Taken 41\.\d km from the nearest site, Village Rampur/);
    });

    it('marks an assigned site as assigned', () => {
      expect(check(score(), 'wrong_location').detail.assigned).toBe(true);
    });

    it('is not checked without GPS (missing_metadata covers it)', () => {
      const c = check(score({ lat: null }), 'wrong_location');
      expect(c).toMatchObject({ passed: true, reason: 'Not checked: no GPS location in the file' });
    });
  });

  describe('wrong_time', () => {
    it('fails before the project start', () => {
      const c = check(score({ capturedAt: new Date('2023-12-31T23:59:59Z') }), 'wrong_time');
      expect(c).toMatchObject({ passed: false, deduction: 20 });
      expect(c.reason).toBe('Captured 31 Dec 2023, before the project started on 1 Jan 2024');
      expect(c.detail).toEqual({
        capturedAt: '2023-12-31T23:59:59.000Z',
        projectStart: '2024-01-01T00:00:00.000Z',
        projectEnd: '2024-12-31T00:00:00.000Z',
      });
    });

    it('treats the end date as inclusive', () => {
      const lastMoment = score({
        capturedAt: new Date('2024-12-31T23:59:59Z'),
        uploadedAt: new Date('2025-01-01T00:00:00Z'),
      });
      expect(check(lastMoment, 'wrong_time').passed).toBe(true);

      const nextDay = check(
        score({
          capturedAt: new Date('2025-01-01T00:00:00Z'),
          uploadedAt: new Date('2025-01-02T00:00:00Z'),
        }),
        'wrong_time',
      );
      expect(nextDay).toMatchObject({ passed: false, deduction: 20 });
      expect(nextDay.reason).toBe('Captured 1 Jan 2025, after the project ended on 31 Dec 2024');
    });

    it('never fails late for an ongoing project', () => {
      const ongoing = { ...project, endDate: null };
      const c = check(
        score(
          { capturedAt: new Date('2030-01-01T00:00:00Z'), uploadedAt: new Date('2030-01-02Z') },
          [],
          { project: ongoing },
        ),
        'wrong_time',
      );
      expect(c.passed).toBe(true);
      expect(c.detail.projectEnd).toBeNull();
    });

    it('is not checked without a capture date', () => {
      const c = check(score({ capturedAt: null }), 'wrong_time');
      expect(c).toMatchObject({ passed: true, reason: 'Not checked: no capture date in the file' });
    });
  });

  describe('missing_metadata', () => {
    it.each([
      [
        { lat: null, lng: null },
        'No GPS location',
        { missingGps: true, missingCaptureDate: false },
      ],
      [{ lng: null }, 'No GPS location', { missingGps: true, missingCaptureDate: false }],
      [{ capturedAt: null }, 'No capture date', { missingGps: false, missingCaptureDate: true }],
      [
        { lat: null, capturedAt: null },
        'No GPS location or capture date',
        { missingGps: true, missingCaptureDate: true },
      ],
    ] as const)('flags %o as unverified, not fake', (overrides, what, detail) => {
      const c = check(score(overrides), 'missing_metadata');
      expect(c).toMatchObject({ passed: false, deduction: 15, detail });
      expect(c.reason).toBe(`${what} in the file: unverified, not necessarily fake`);
      expect(c.reason).not.toMatch(/\bfake\b(?<!necessarily fake)/);
    });
  });

  describe('late_upload', () => {
    it('fails when uploaded more than the limit after capture', () => {
      const c = check(
        score({
          capturedAt: new Date('2024-01-10T00:00:00Z'),
          uploadedAt: new Date('2024-04-10T00:00:01Z'),
        }),
        'late_upload',
      );
      expect(c).toMatchObject({ passed: false, deduction: 10 });
      expect(c.reason).toBe('Uploaded 91 days after it was taken (limit 90)');
      expect(c.detail).toEqual({ delayDays: 91, limitDays: 90 });
    });

    it('passes at exactly the limit', () => {
      const c = check(
        score({
          capturedAt: new Date('2024-01-10T00:00:00Z'),
          uploadedAt: new Date('2024-04-09T00:00:00Z'),
        }),
        'late_upload',
      );
      expect(c).toMatchObject({ passed: true, reason: 'Uploaded 90 days after it was taken' });
    });

    it('treats a capture time after upload (clock skew) as 0 days', () => {
      const c = check(
        score({
          capturedAt: new Date('2024-03-16T12:00:00Z'),
          uploadedAt: new Date('2024-03-16T10:00:00Z'),
        }),
        'late_upload',
      );
      expect(c).toMatchObject({ passed: true, reason: 'Uploaded 0 days after it was taken' });
    });

    it('is not checked without a capture date', () => {
      const c = check(score({ capturedAt: null }), 'late_upload');
      expect(c).toMatchObject({ passed: true, reason: 'Not checked: no capture date in the file' });
    });
  });

  it('lands in the review band for mid scores', () => {
    // 25 (location) + 15 (no date) = 40 → 60.
    const result = score({ lat: 28.48, capturedAt: null });
    expect(result.score).toBe(60);
    expect(result.band).toBe('review');
  });
});

describe('comparisonSite', () => {
  const rampur = { id: 's1', name: 'Village Rampur', lat: 28.47, lng: 77.03, radiusM: 500 };
  const kheda = { id: 's2', name: 'Kheda Dhani', lat: 28.6, lng: 77.2, radiusM: 400 };
  const sites = [rampur, kheda];

  it('uses the assigned site when there is one', () => {
    expect(comparisonSite(kheda, { lat: 28.47, lng: 77.03 }, sites)).toBe(kheda);
  });

  it('falls back to the closest project site for unassigned evidence with GPS', () => {
    expect(comparisonSite(null, { lat: 28.5, lng: 77.05 }, sites)).toEqual({
      ...rampur,
      nearest: true,
    });
  });

  it('has nothing to compare without GPS or without sites', () => {
    expect(comparisonSite(null, { lat: null, lng: 77 }, sites)).toBeNull();
    expect(comparisonSite(null, { lat: 28, lng: null }, sites)).toBeNull();
    expect(comparisonSite(null, { lat: 28.5, lng: 77.05 }, [])).toBeNull();
  });
});

describe('bandFor', () => {
  it.each([
    [100, 'verified'],
    [80, 'verified'],
    [79, 'review'],
    [50, 'review'],
    [49, 'flagged'],
    [0, 'flagged'],
  ] as const)('score %i is %s with default cut-offs', (value, band) => {
    expect(bandFor(value, settings)).toBe(band);
  });

  it('uses the configured cut-offs', () => {
    expect(bandFor(85, { bandVerifiedMin: 90, bandReviewMin: 60 })).toBe('review');
  });
});
