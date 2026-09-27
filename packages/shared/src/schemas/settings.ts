import { z } from 'zod';
import { TRUST_BANDS } from '../domain.js';
import { orgSettingsSchema } from '../settings.js';

export const settingsResponse = z.object({
  settings: orgSettingsSchema,
  updatedAt: z.string(),
});
export type SettingsResponse = z.infer<typeof settingsResponse>;

/** How re-scoring with a set of settings moves assets between bands. */
export const rescoreSummarySchema = z.object({
  total: z.number().int(),
  /** Assets whose score changed at all. */
  scoreChanged: z.number().int(),
  /** Assets that would land in a different band. */
  bandChanged: z.number().int(),
  transitions: z.array(
    z.object({ from: z.enum(TRUST_BANDS), to: z.enum(TRUST_BANDS), count: z.number().int() }),
  ),
});
export type RescoreSummary = z.infer<typeof rescoreSummarySchema>;

export const saveSettingsResponse = settingsResponse.extend({ rescored: rescoreSummarySchema });
export type SaveSettingsResponse = z.infer<typeof saveSettingsResponse>;
