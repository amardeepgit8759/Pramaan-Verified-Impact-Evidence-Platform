import { z } from 'zod';
import { PROJECT_STATUSES } from '../domain.js';

const isoDate = z.iso.date({ error: 'Use a YYYY-MM-DD date' });

/** UN Sustainable Development Goals are numbered 1–17. */
export const SDG_GOALS = Array.from({ length: 17 }, (_, i) => i + 1);

const projectFields = z.object({
  name: z.string().trim().min(1, 'Give the project a name').max(160),
  description: z.string().trim().max(4000).default(''),
  startDate: isoDate,
  endDate: isoDate.nullable().default(null),
  sdgGoals: z
    .array(z.number().int().min(1).max(17))
    .max(17)
    .default([])
    .transform((goals) => [...new Set(goals)].sort((a, b) => a - b)),
  csrCategory: z.string().trim().max(160).nullable().default(null),
});

const datesInOrder = {
  check: (p: { startDate: string; endDate: string | null }) =>
    p.endDate === null || p.endDate >= p.startDate,
  params: { message: 'End date must be on or after the start date', path: ['endDate'] },
};

export const projectInput = projectFields.refine(datesInOrder.check, datesInOrder.params);
export type ProjectInput = z.input<typeof projectInput>;

/** Editing sends the whole project, including its status. */
export const projectUpdateInput = projectFields
  .extend({ status: z.enum(PROJECT_STATUSES) })
  .refine(datesInOrder.check, datesInOrder.params);
export type ProjectUpdateInput = z.input<typeof projectUpdateInput>;

export const bandCountsSchema = z.object({
  verified: z.number().int(),
  review: z.number().int(),
  flagged: z.number().int(),
});
export type BandCounts = z.infer<typeof bandCountsSchema>;

export const projectSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  sdgGoals: z.array(z.number().int()),
  csrCategory: z.string().nullable(),
  status: z.enum(PROJECT_STATUSES),
  createdAt: z.string(),
  siteCount: z.number().int(),
  assetCount: z.number().int(),
  bands: bandCountsSchema,
  averageTrust: z.number().nullable(),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const projectListResponse = z.object({ projects: z.array(projectSummarySchema) });
