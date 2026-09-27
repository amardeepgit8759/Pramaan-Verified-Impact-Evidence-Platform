import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number(),
  database: z.object({
    connected: z.boolean(),
    pgvector: z.boolean(),
    latencyMs: z.number().nullable(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
