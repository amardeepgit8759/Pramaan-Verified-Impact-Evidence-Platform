import type { OrgSettings, TrustCheck } from './settings.js';
import { TRUST_CHECKS } from './settings.js';

export const TRUST_BANDS = ['verified', 'review', 'flagged'] as const;
export type TrustBand = (typeof TRUST_BANDS)[number];

export type CheckResults = Record<TrustCheck, boolean>;

export interface TrustBreakdownItem {
  check: TrustCheck;
  failed: boolean;
  penalty: number;
}

export interface TrustScore {
  score: number;
  band: TrustBand;
  breakdown: TrustBreakdownItem[];
}

export function bandFor(score: number, bands: OrgSettings['bands']): TrustBand {
  if (score >= bands.verified) return 'verified';
  if (score >= bands.review) return 'review';
  return 'flagged';
}

/**
 * Combine check outcomes into a Trust Score: start at 100 and deduct the configured
 * weight for each failed check. The breakdown lists every check so the UI can show why.
 */
export function computeTrustScore(failed: CheckResults, settings: OrgSettings): TrustScore {
  const breakdown = TRUST_CHECKS.map((check) => ({
    check,
    failed: failed[check],
    penalty: failed[check] ? settings.trustWeights[check] : 0,
  }));
  const score = Math.max(0, 100 - breakdown.reduce((sum, item) => sum + item.penalty, 0));
  return { score, band: bandFor(score, settings.bands), breakdown };
}
