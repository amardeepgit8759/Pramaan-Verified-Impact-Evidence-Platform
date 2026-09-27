import { z } from 'zod';
import {
  CHECK_TYPES,
  RESOURCE_TYPES,
  REVIEW_DECISIONS,
  TAGGING_PROVIDERS,
  TRUST_BANDS,
} from '../domain.js';

export const uploadSignatureInput = z.object({
  projectId: z.uuid(),
  siteId: z.uuid().nullable().optional(),
});
export type UploadSignatureInput = z.infer<typeof uploadSignatureInput>;

/**
 * Everything the browser needs to upload one file straight to Cloudinary. `params` are sent
 * verbatim as form fields next to the file; they are covered by `signature`, so the browser
 * can't change the folder, context or anything else.
 */
export const uploadSignatureResponse = z.object({
  uploadUrl: z.url(),
  params: z.record(z.string(), z.string()),
});
export type UploadSignatureResponse = z.infer<typeof uploadSignatureResponse>;

export const confirmUploadInput = z.object({
  publicId: z.string().min(1).max(255),
  projectId: z.uuid(),
  siteId: z.uuid().nullable().optional(),
  resourceType: z.enum(RESOURCE_TYPES).default('image'),
});
export type ConfirmUploadInput = z.input<typeof confirmUploadInput>;

export const trustCheckSchema = z.object({
  type: z.enum(CHECK_TYPES),
  passed: z.boolean(),
  deduction: z.number().int(),
  reason: z.string(),
  detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export type TrustCheck = z.infer<typeof trustCheckSchema>;

export const assetSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  siteId: z.uuid().nullable(),
  siteName: z.string().nullable(),
  uploadedBy: z.string().nullable(),
  resourceType: z.enum(RESOURCE_TYPES),
  format: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  bytes: z.number().int(),
  originalFilename: z.string().nullable(),
  secureUrl: z.string(),
  /** Square, cropped around the subject; for grids. */
  thumbnailUrl: z.string(),
  /** Large, width-limited still image; for detail views (a frame for videos). */
  previewUrl: z.string(),
  capturedAt: z.string().nullable(),
  uploadedAt: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  tags: z.array(z.string()),
  taggingProvider: z.enum(TAGGING_PROVIDERS),
  caption: z.string().nullable(),
  trustScore: z.number().int(),
  trustBand: z.enum(TRUST_BANDS),
  reviewDecision: z.enum(REVIEW_DECISIONS).nullable(),
});
export type Asset = z.infer<typeof assetSchema>;

export const assetDetailSchema = assetSchema.extend({
  checks: z.array(trustCheckSchema),
  exif: z.record(z.string(), z.string()),
});
export type AssetDetail = z.infer<typeof assetDetailSchema>;

export const assetListResponse = z.object({ assets: z.array(assetSchema) });
