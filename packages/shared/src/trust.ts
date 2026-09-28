import type { CheckType, TrustBand } from './domain.js';
import { formatDay, formatDistance, plural } from './format.js';
import { haversineKm, nearestSite } from './geo.js';
import { hammingDistance } from './phash.js';
import type { OrgSettings } from './settings.js';

const DAY_MS = 86_400_000;
const UNVERIFIED = 'unverified, not necessarily fake';

/** The asset being scored. `phash` is a 64-character bit string, or null for videos. */
export interface ScoringAsset {
  id: string;
  projectId: string;
  etag: string;
  phash: string | null;
  capturedAt: Date | null;
  uploadedAt: Date;
  lat: number | null;
  lng: number | null;
}

/** Another asset in the organization that shares the etag or has a similar pHash. */
export interface DuplicateCandidate {
  id: string;
  projectId: string;
  projectName: string;
  etag: string;
  phash: string | null;
  uploadedAt: Date;
}

export interface ScoringProject {
  id: string;
  name: string;
  /** Project dates are whole days; pass UTC midnight. `endDate` null means ongoing. */
  startDate: Date;
  endDate: Date | null;
}

export interface ScoringSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  /**
   * True when the asset isn't assigned to this site: it's the project's closest site,
   * used so evidence outside every site can't skip the location check.
   */
  nearest?: boolean;
}

/**
 * The site an asset's location is checked against: its own site, or, for unassigned
 * evidence with GPS, the project's closest site. Null when neither applies.
 */
export function comparisonSite<S extends Omit<ScoringSite, 'nearest'>>(
  assigned: S | null,
  point: { lat: number | null; lng: number | null },
  projectSites: readonly S[],
): ScoringSite | null {
  if (assigned) return assigned;
  if (point.lat === null || point.lng === null) return null;
  const closest = nearestSite({ lat: point.lat, lng: point.lng }, projectSites);
  return closest && { ...closest.site, nearest: true };
}

export interface TrustCheckResult {
  type: CheckType;
  passed: boolean;
  deduction: number;
  /** One plain-language sentence explaining the outcome, shown in the UI and reports. */
  reason: string;
  detail: Record<string, string | number | boolean | null>;
}

export interface TrustScoreResult {
  score: number;
  band: TrustBand;
  checks: TrustCheckResult[];
}

type Bands = Pick<OrgSettings, 'bandVerifiedMin' | 'bandReviewMin'>;

export function bandFor(score: number, settings: Bands): TrustBand {
  if (score >= settings.bandVerifiedMin) return 'verified';
  if (score >= settings.bandReviewMin) return 'review';
  return 'flagged';
}

const pass = (type: CheckType, reason: string, detail: TrustCheckResult['detail'] = {}) => ({
  type,
  passed: true,
  deduction: 0,
  reason,
  detail,
});

const fail = (
  type: CheckType,
  deduction: number,
  reason: string,
  detail: TrustCheckResult['detail'],
) => ({ type, passed: false, deduction, reason, detail });

function exactDuplicate(
  asset: ScoringAsset,
  candidates: readonly DuplicateCandidate[],
  settings: OrgSettings,
): TrustCheckResult {
  const copies = candidates.filter((c) => c.id !== asset.id && c.etag === asset.etag);
  const daysApart = (c: DuplicateCandidate) =>
    Math.abs(c.uploadedAt.getTime() - asset.uploadedAt.getTime()) / DAY_MS;

  const otherProject = copies.find((c) => c.projectId !== asset.projectId);
  if (otherProject) {
    return fail(
      'exact_duplicate',
      settings.weights.exact_duplicate,
      `Exact copy of an asset in ${otherProject.projectName}`,
      {
        matchedAssetId: otherProject.id,
        matchedProjectId: otherProject.projectId,
        sameProject: false,
      },
    );
  }

  const outsideBurst = copies.find((c) => daysApart(c) > settings.duplicateBurstDays);
  if (outsideBurst) {
    const days = Math.floor(daysApart(outsideBurst));
    return fail(
      'exact_duplicate',
      settings.weights.exact_duplicate,
      `Same file was uploaded to this project ${plural(days, 'day')} apart`,
      {
        matchedAssetId: outsideBurst.id,
        matchedProjectId: outsideBurst.projectId,
        sameProject: true,
        daysApart: days,
      },
    );
  }

  if (copies.length > 0) {
    return pass(
      'exact_duplicate',
      `Re-uploaded within ${plural(settings.duplicateBurstDays, 'day')}; treated as a retry, not a duplicate`,
      { matchedAssetId: copies[0]!.id, sameProject: true },
    );
  }
  return pass('exact_duplicate', 'No exact copies found');
}

function nearDuplicate(
  asset: ScoringAsset,
  candidates: readonly DuplicateCandidate[],
  settings: OrgSettings,
): TrustCheckResult {
  const { phash } = asset;
  if (!phash) return pass('near_duplicate', 'Not checked: this file has no perceptual hash');

  let best: { candidate: DuplicateCandidate; distance: number } | null = null;
  for (const c of candidates) {
    if (c.id === asset.id || c.projectId === asset.projectId || c.etag === asset.etag || !c.phash) {
      continue;
    }
    const distance = hammingDistance(phash, c.phash);
    if (distance <= settings.phashThreshold && (!best || distance < best.distance)) {
      best = { candidate: c, distance };
    }
  }

  if (!best) return pass('near_duplicate', 'No near-copies in other projects');
  return fail(
    'near_duplicate',
    settings.weights.near_duplicate,
    `Near-copy of an asset in ${best.candidate.projectName} (distance ${best.distance}/64)`,
    {
      matchedAssetId: best.candidate.id,
      matchedProjectId: best.candidate.projectId,
      hammingDistance: best.distance,
      threshold: settings.phashThreshold,
    },
  );
}

function wrongLocation(
  asset: ScoringAsset,
  site: ScoringSite | null,
  settings: OrgSettings,
): TrustCheckResult {
  if (!site) return pass('wrong_location', 'Not checked: no site assigned');
  if (asset.lat === null || asset.lng === null) {
    return pass('wrong_location', 'Not checked: no GPS location in the file');
  }

  const distanceKm = haversineKm({ lat: asset.lat, lng: asset.lng }, site);
  const radius = formatDistance(site.radiusM / 1000);
  const detail = {
    siteId: site.id,
    distanceKm: Math.round(distanceKm * 1000) / 1000,
    radiusM: site.radiusM,
    assigned: !site.nearest,
  };
  const distanceM = distanceKm * 1000;
  // An unassigned asset is compared with the project's closest site, and says so.
  const from = site.nearest ? `the nearest site, ${site.name}` : site.name;

  if (distanceM <= site.radiusM) {
    return pass(
      'wrong_location',
      `Taken ${formatDistance(distanceKm)} from ${from}, within its ${radius} radius`,
      { ...detail, far: false },
    );
  }
  const far = distanceM > site.radiusM * settings.farLocationMultiplier;
  return fail(
    'wrong_location',
    far ? settings.weights.wrong_location_far : settings.weights.wrong_location,
    `Taken ${formatDistance(distanceKm)} from ${from} (allowed radius ${radius})`,
    { ...detail, far },
  );
}

function wrongTime(asset: ScoringAsset, project: ScoringProject, settings: OrgSettings) {
  const { capturedAt } = asset;
  if (!capturedAt) return pass('wrong_time', 'Not checked: no capture date in the file');

  const detail = {
    capturedAt: capturedAt.toISOString(),
    projectStart: project.startDate.toISOString(),
    projectEnd: project.endDate?.toISOString() ?? null,
  };
  if (capturedAt.getTime() < project.startDate.getTime()) {
    return fail(
      'wrong_time',
      settings.weights.wrong_time,
      `Captured ${formatDay(capturedAt)}, before the project started on ${formatDay(project.startDate)}`,
      detail,
    );
  }
  // The end date is inclusive: anything before the following midnight is in range.
  if (project.endDate && capturedAt.getTime() >= project.endDate.getTime() + DAY_MS) {
    return fail(
      'wrong_time',
      settings.weights.wrong_time,
      `Captured ${formatDay(capturedAt)}, after the project ended on ${formatDay(project.endDate)}`,
      detail,
    );
  }
  return pass('wrong_time', `Captured ${formatDay(capturedAt)}, during the project`, detail);
}

function missingMetadata(asset: ScoringAsset, settings: OrgSettings): TrustCheckResult {
  const missingGps = asset.lat === null || asset.lng === null;
  const missingCaptureDate = asset.capturedAt === null;
  if (!missingGps && !missingCaptureDate) {
    return pass('missing_metadata', 'GPS location and capture date are present', {
      missingGps,
      missingCaptureDate,
    });
  }
  const what =
    missingGps && missingCaptureDate
      ? 'No GPS location or capture date'
      : missingGps
        ? 'No GPS location'
        : 'No capture date';
  return fail(
    'missing_metadata',
    settings.weights.missing_metadata,
    `${what} in the file: ${UNVERIFIED}`,
    { missingGps, missingCaptureDate },
  );
}

function lateUpload(asset: ScoringAsset, settings: OrgSettings): TrustCheckResult {
  const { capturedAt } = asset;
  if (!capturedAt) return pass('late_upload', 'Not checked: no capture date in the file');

  const delayMs = asset.uploadedAt.getTime() - capturedAt.getTime();
  const delayDays = Math.max(0, Math.floor(delayMs / DAY_MS));
  const detail = { delayDays, limitDays: settings.lateUploadDays };
  if (delayMs > settings.lateUploadDays * DAY_MS) {
    return fail(
      'late_upload',
      settings.weights.late_upload,
      `Uploaded ${plural(delayDays, 'day')} after it was taken (limit ${settings.lateUploadDays})`,
      detail,
    );
  }
  return pass('late_upload', `Uploaded ${plural(delayDays, 'day')} after it was taken`, detail);
}

/**
 * Transparent Trust Score: start at 100, subtract the configured deduction for every
 * failed check, clamp to 0–100. Every check is returned with a plain-language reason so
 * the UI can show exactly why an asset scored what it did.
 *
 * `candidates` are the organization's other assets that share this asset's etag or have a
 * pHash within the threshold (found in SQL); passing extra assets is harmless.
 */
export function computeTrustScore(
  asset: ScoringAsset,
  candidates: readonly DuplicateCandidate[],
  project: ScoringProject,
  site: ScoringSite | null,
  settings: OrgSettings,
): TrustScoreResult {
  const checks = [
    exactDuplicate(asset, candidates, settings),
    nearDuplicate(asset, candidates, settings),
    wrongLocation(asset, site, settings),
    wrongTime(asset, project, settings),
    missingMetadata(asset, settings),
    lateUpload(asset, settings),
  ];
  const total = checks.reduce((sum, check) => sum + check.deduction, 0);
  const score = Math.min(100, Math.max(0, 100 - total));
  return { score, band: bandFor(score, settings), checks };
}
