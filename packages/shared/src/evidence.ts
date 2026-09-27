import type { ProjectStatus, ReviewDecision, TrustBand } from './domain.js';
import { plural } from './format.js';

const DAY_MS = 86_400_000;

/**
 * Whether an asset may be cited in a report: verified assets (unless an admin rejected
 * them), plus review/flagged assets an admin approved. `latestDecision` is the most
 * recent entry in the asset's review log, if any.
 */
export function isReportEligible(band: TrustBand, latestDecision: ReviewDecision | null): boolean {
  if (latestDecision === 'approve') return true;
  if (latestDecision === 'reject') return false;
  return band === 'verified';
}

export interface SiteGapInput {
  projectStatus: ProjectStatus;
  /** Upload time of the site's most recent report-eligible asset, or null if it never had one. */
  lastVerifiedAt: Date | null;
  gapDays: number;
  now: Date;
}

export interface SiteGapStatus {
  gap: boolean;
  reason: string;
  daysSinceVerified: number | null;
}

/** Documentation-gap status for one site. Only active projects can have gaps. */
export function siteGapStatus({
  projectStatus,
  lastVerifiedAt,
  gapDays,
  now,
}: SiteGapInput): SiteGapStatus {
  const daysSinceVerified = lastVerifiedAt
    ? Math.max(0, Math.floor((now.getTime() - lastVerifiedAt.getTime()) / DAY_MS))
    : null;

  if (projectStatus !== 'active') {
    return { gap: false, reason: 'Project is not active', daysSinceVerified };
  }
  if (daysSinceVerified === null) {
    return { gap: true, reason: 'No verified evidence yet', daysSinceVerified };
  }
  if (daysSinceVerified > gapDays) {
    return {
      gap: true,
      reason: `No verified evidence for ${plural(daysSinceVerified, 'day')}`,
      daysSinceVerified,
    };
  }
  return {
    gap: false,
    reason: `Last verified evidence ${plural(daysSinceVerified, 'day')} ago`,
    daysSinceVerified,
  };
}
