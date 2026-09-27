import { z } from 'zod';

export const TRUST_CHECKS = [
  'exactDuplicate',
  'nearDuplicate',
  'gpsMismatch',
  'captureDateMismatch',
  'missingMetadata',
  'lateUpload',
] as const;

export type TrustCheck = (typeof TRUST_CHECKS)[number];

const penalty = z.number().int().min(0).max(100);
const bandCutoff = z.number().int().min(0).max(100);

export const trustWeightsSchema = z.object({
  exactDuplicate: penalty,
  nearDuplicate: penalty,
  gpsMismatch: penalty,
  captureDateMismatch: penalty,
  missingMetadata: penalty,
  lateUpload: penalty,
});

export const orgSettingsSchema = z
  .object({
    trustWeights: trustWeightsSchema,
    phashThreshold: z.number().int().min(0).max(64),
    gpsRadiusMeters: z.number().int().min(10).max(100_000),
    captureDateToleranceDays: z.number().int().min(0).max(365),
    lateUploadWindowHours: z
      .number()
      .int()
      .min(1)
      .max(24 * 365),
    gapAlertWindowDays: z.number().int().min(1).max(365),
    bands: z.object({
      verified: bandCutoff,
      review: bandCutoff,
    }),
  })
  .refine((s) => s.bands.verified > s.bands.review, {
    message: 'The "verified" cut-off must be higher than the "review" cut-off',
    path: ['bands', 'verified'],
  });

export type OrgSettings = z.infer<typeof orgSettingsSchema>;
export type TrustWeights = z.infer<typeof trustWeightsSchema>;
