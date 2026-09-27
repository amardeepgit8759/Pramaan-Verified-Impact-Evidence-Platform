import type { OrgSettings } from './settings.js';

/**
 * Default per-organization settings. These seed the `org_settings` row when an
 * organization is created; every value is editable afterwards on the Settings page.
 */
export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  /** Points deducted from 100 when a check fails. */
  trustWeights: {
    exactDuplicate: 60,
    nearDuplicate: 30,
    gpsMismatch: 25,
    captureDateMismatch: 20,
    missingMetadata: 10,
    lateUpload: 10,
  },
  /** Max Hamming distance between 64-bit perceptual hashes to call two images near-duplicates. */
  phashThreshold: 10,
  /** Distance from the site's coordinates beyond which GPS is treated as the wrong location. */
  gpsRadiusMeters: 1000,
  /** Days a capture date may fall outside the project timeline before it counts as wrong. */
  captureDateToleranceDays: 3,
  /** Hours between capture and upload after which an asset counts as a late upload. */
  lateUploadWindowHours: 72,
  /** A site with no verified evidence for this many days raises a documentation-gap alert. */
  gapAlertWindowDays: 30,
  /** Minimum score for each Trust Score band; anything below `review` is flagged. */
  bands: {
    verified: 80,
    review: 50,
  },
};
