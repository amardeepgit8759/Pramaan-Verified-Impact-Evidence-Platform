import { describe, expect, it } from 'vitest';
import { DEFAULT_ORG_SETTINGS } from './defaults.js';
import { orgSettingsSchema, TRUST_CHECKS, type TrustCheck } from './settings.js';
import { bandFor, computeTrustScore, type CheckResults } from './trust.js';

const noFailures = Object.fromEntries(TRUST_CHECKS.map((c) => [c, false])) as CheckResults;
const failing = (...checks: TrustCheck[]): CheckResults => ({
  ...noFailures,
  ...Object.fromEntries(checks.map((c) => [c, true])),
});

describe('default settings', () => {
  it('pass the settings schema', () => {
    expect(orgSettingsSchema.safeParse(DEFAULT_ORG_SETTINGS).success).toBe(true);
  });

  it('reject band cut-offs in the wrong order', () => {
    const result = orgSettingsSchema.safeParse({
      ...DEFAULT_ORG_SETTINGS,
      bands: { verified: 40, review: 60 },
    });
    expect(result.success).toBe(false);
  });
});

describe('computeTrustScore', () => {
  it('scores a clean asset 100 and verified', () => {
    const result = computeTrustScore(noFailures, DEFAULT_ORG_SETTINGS);
    expect(result.score).toBe(100);
    expect(result.band).toBe('verified');
    expect(result.breakdown).toHaveLength(TRUST_CHECKS.length);
  });

  it('deducts the configured weight for each failed check', () => {
    const settings = {
      ...DEFAULT_ORG_SETTINGS,
      trustWeights: { ...DEFAULT_ORG_SETTINGS.trustWeights, gpsMismatch: 7, lateUpload: 4 },
    };
    const result = computeTrustScore(failing('gpsMismatch', 'lateUpload'), settings);
    expect(result.score).toBe(89);
    expect(result.breakdown.find((b) => b.check === 'gpsMismatch')).toEqual({
      check: 'gpsMismatch',
      failed: true,
      penalty: 7,
    });
  });

  it('never goes below zero', () => {
    const result = computeTrustScore(failing(...TRUST_CHECKS), DEFAULT_ORG_SETTINGS);
    expect(result.score).toBe(0);
    expect(result.band).toBe('flagged');
  });
});

describe('bandFor', () => {
  const bands = { verified: 80, review: 50 };
  it.each([
    [100, 'verified'],
    [80, 'verified'],
    [79, 'review'],
    [50, 'review'],
    [49, 'flagged'],
  ] as const)('score %i is %s', (score, band) => {
    expect(bandFor(score, bands)).toBe(band);
  });
});
