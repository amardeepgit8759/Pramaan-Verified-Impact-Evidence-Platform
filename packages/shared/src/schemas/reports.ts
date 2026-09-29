import { z } from 'zod';
import { PROJECT_STATUSES, REPORT_STATUSES } from '../domain.js';
import { assetSchema, reviewSchema, trustCheckSchema } from './assets.js';
import { siteSchema } from './sites.js';

const isoDate = z.iso.date({ error: 'Use a YYYY-MM-DD date' });

/** The reporting period; evidence is included by capture day (upload day if unknown). */
export const reportInput = z
  .object({ periodStart: isoDate, periodEnd: isoDate })
  .refine((p) => p.periodEnd >= p.periodStart, {
    message: 'The period must end on or after its start',
    path: ['periodEnd'],
  });
export type ReportInput = z.infer<typeof reportInput>;

export const reportClaimSchema = z.object({
  id: z.uuid(),
  /** 0-based reading order; printed 1-based. */
  position: z.number().int(),
  section: z.string(),
  sentence: z.string(),
  assetIds: z.array(z.uuid()),
});
export type ReportClaim = z.infer<typeof reportClaimSchema>;

export const reportSummarySchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  status: z.enum(REPORT_STATUSES),
  summary: z.string().nullable(),
  claimCount: z.number().int(),
  citedAssetCount: z.number().int(),
  /** Claims the model wrote that failed citation checks and were removed. */
  droppedClaims: z.number().int(),
  error: z.string().nullable(),
  generatedBy: z.string().nullable(),
  createdAt: z.string(),
});
export type ReportSummary = z.infer<typeof reportSummarySchema>;

export const reportListResponse = z.object({ reports: z.array(reportSummarySchema) });

/** One cited asset in the evidence annex, with everything needed to judge it. */
export const reportEvidenceSchema = z.object({
  /** "E1", "E2"… in order of first citation. */
  ref: z.string(),
  asset: assetSchema,
  checks: z.array(trustCheckSchema),
  reviews: z.array(reviewSchema),
  citedIn: z.array(z.number().int()),
});
export type ReportEvidence = z.infer<typeof reportEvidenceSchema>;

export const reportSectionSchema = z.object({
  heading: z.string(),
  claims: z.array(reportClaimSchema),
});
export type ReportSection = z.infer<typeof reportSectionSchema>;

export const reportDetailSchema = reportSummarySchema.extend({
  projectName: z.string(),
  organisationName: z.string(),
  sdgGoals: z.array(z.number().int()),
  csrCategory: z.string().nullable(),
  sections: z.array(reportSectionSchema),
  evidence: z.array(reportEvidenceSchema),
});
export type ReportDetail = z.infer<typeof reportDetailSchema>;

// Funder share links

export const SHARE_LINK_DAYS = [7, 30, 90] as const;

export const shareLinkInput = z.object({
  expiresInDays: z.number().int().min(1).max(90).default(30),
});
export type ShareLinkInput = z.input<typeof shareLinkInput>;

export const shareLinkSchema = z.object({
  id: z.uuid(),
  token: z.string(),
  expiresAt: z.string(),
  expired: z.boolean(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});
export type ShareLink = z.infer<typeof shareLinkSchema>;

export const shareLinkListResponse = z.object({ links: z.array(shareLinkSchema) });

export const sharedEvidenceSchema = z.object({
  asset: assetSchema,
  checks: z.array(trustCheckSchema),
});
export type SharedEvidence = z.infer<typeof sharedEvidenceSchema>;

/** Everything the public, read-only funder page shows. Only report-eligible evidence. */
export const sharedProjectSchema = z.object({
  organisationName: z.string(),
  project: z.object({
    id: z.uuid(),
    name: z.string(),
    description: z.string(),
    startDate: z.string(),
    endDate: z.string().nullable(),
    sdgGoals: z.array(z.number().int()),
    csrCategory: z.string().nullable(),
    status: z.enum(PROJECT_STATUSES),
  }),
  expiresAt: z.string(),
  metrics: z.object({
    /** Report-eligible evidence. */
    evidence: z.number().int(),
    sites: z.number().int(),
    sitesWithEvidence: z.number().int(),
    /** Average Trust Score of the eligible evidence. */
    averageTrust: z.number().nullable(),
    /** Share of all the project's evidence that verified: shown so funders see the whole picture. */
    verifiedPct: z.number().nullable(),
    reports: z.number().int(),
    lastEvidenceAt: z.string().nullable(),
  }),
  sites: z.array(siteSchema),
  evidence: z.array(sharedEvidenceSchema),
  reports: z.array(reportSummarySchema),
});
export type SharedProject = z.infer<typeof sharedProjectSchema>;
