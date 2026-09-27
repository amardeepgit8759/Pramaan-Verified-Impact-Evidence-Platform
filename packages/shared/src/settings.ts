import { z } from 'zod';

const deduction = z.number().int().min(0).max(100);
const cutoff = z.number().int().min(0).max(100);

/** Points deducted when a check fails. Keys match the `check_type` enum. */
export const trustWeightsSchema = z.object({
  exact_duplicate: deduction,
  near_duplicate: deduction,
  wrong_location: deduction,
  /** Used instead of `wrong_location` when the asset is far outside the site radius. */
  wrong_location_far: deduction,
  wrong_time: deduction,
  missing_metadata: deduction,
  late_upload: deduction,
});

export const orgSettingsSchema = z
  .object({
    weights: trustWeightsSchema,
    /** Max Hamming distance (of 64 bits) between perceptual hashes to count as a near-copy. */
    phashThreshold: z.number().int().min(0).max(64),
    /** Days between capture and upload after which an asset counts as a late upload. */
    lateUploadDays: z.number().int().min(1).max(3650),
    /** A site with no verified asset for this many days has a documentation gap. */
    gapDays: z.number().int().min(1).max(365),
    bandVerifiedMin: cutoff,
    bandReviewMin: cutoff,
    /** Re-uploading the same file to the same project within this many days is not a duplicate. */
    duplicateBurstDays: z.number().int().min(0).max(365),
    /** Beyond this many site radii, the heavier `wrong_location_far` deduction applies. */
    farLocationMultiplier: z.number().int().min(2).max(1000),
  })
  .refine((s) => s.bandVerifiedMin > s.bandReviewMin, {
    message: 'The "verified" cut-off must be higher than the "review" cut-off',
    path: ['bandVerifiedMin'],
  });

export type OrgSettings = z.infer<typeof orgSettingsSchema>;
export type TrustWeights = z.infer<typeof trustWeightsSchema>;
