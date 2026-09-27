import { z } from 'zod';

/** Platform-wide counts for the landing page. Aggregates only, never names or media. */
export const publicStatsSchema = z.object({
  totalAssets: z.number().int(),
  verifiedAssets: z.number().int(),
  projects: z.number().int(),
  sites: z.number().int(),
  reports: z.number().int(),
});
export type PublicStats = z.infer<typeof publicStatsSchema>;
