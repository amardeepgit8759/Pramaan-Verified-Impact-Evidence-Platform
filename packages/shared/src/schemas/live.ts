import { z } from 'zod';
import { EVENT_TYPES, TRUST_BANDS } from '../domain.js';

/** One entry in the activity log, as streamed over SSE and listed in the feed. */
export const liveEventSchema = z.object({
  id: z.number().int(),
  type: z.enum(EVENT_TYPES),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type LiveEvent = z.infer<typeof liveEventSchema>;

export const eventListResponse = z.object({ events: z.array(liveEventSchema) });

const bandCounts = z.object({
  verified: z.number().int(),
  review: z.number().int(),
  flagged: z.number().int(),
});

export const metricsSchema = z.object({
  totalAssets: z.number().int(),
  /** 0–100, or null with no evidence. */
  verifiedPct: z.number().nullable(),
  bands: bandCounts,
  averageTrust: z.number().nullable(),
  flaggedLast7Days: z.number().int(),
  /** Review or flagged, with no admin decision yet. */
  needsReview: z.number().int(),
  uploadsPerDay: z.array(z.object({ date: z.string(), count: z.number().int() })),
  bandsOverTime: z.array(bandCounts.extend({ date: z.string() })),
  assetsPerSite: z.array(
    z.object({
      siteId: z.uuid(),
      siteName: z.string(),
      projectId: z.uuid(),
      count: z.number().int(),
      verified: z.number().int(),
    }),
  ),
  gapSites: z.array(
    z.object({
      siteId: z.uuid(),
      siteName: z.string(),
      projectId: z.uuid(),
      projectName: z.string(),
      daysSinceVerified: z.number().int().nullable(),
      reason: z.string(),
    }),
  ),
  reportsGenerated: z.number().int(),
});
export type Metrics = z.infer<typeof metricsSchema>;

/** Payload fields the UI relies on; everything else is optional detail. */
export const eventPayloadSchema = z
  .object({
    assetId: z.string().optional(),
    projectId: z.string().optional(),
    projectName: z.string().optional(),
    siteName: z.string().nullable().optional(),
    band: z.enum(TRUST_BANDS).optional(),
    previousBand: z.enum(TRUST_BANDS).optional(),
    score: z.number().optional(),
    actorId: z.string().optional(),
    actorName: z.string().optional(),
    decision: z.enum(['approve', 'reject']).optional(),
    bandChanged: z.number().optional(),
    gap: z.boolean().optional(),
  })
  .loose();
export type EventPayload = z.infer<typeof eventPayloadSchema>;
