import type { OrgSettings } from './settings.js';

/**
 * Default per-organization settings. These seed the `settings` row when an
 * organization is created; every value is editable afterwards on the Settings page.
 */
export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  weights: {
    exact_duplicate: 60,
    near_duplicate: 40,
    wrong_location: 25,
    wrong_location_far: 40,
    wrong_time: 20,
    missing_metadata: 15,
    late_upload: 10,
  },
  phashThreshold: 6,
  lateUploadDays: 90,
  gapDays: 30,
  bandVerifiedMin: 80,
  bandReviewMin: 50,
  duplicateBurstDays: 7,
  farLocationMultiplier: 10,
};
