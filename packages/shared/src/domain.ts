/** Enum values shared by the database schema, the API and the UI. */

export const USER_ROLES = ['admin', 'field', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const TRUST_BANDS = ['verified', 'review', 'flagged'] as const;
export type TrustBand = (typeof TRUST_BANDS)[number];

export const CHECK_TYPES = [
  'exact_duplicate',
  'near_duplicate',
  'wrong_location',
  'wrong_time',
  'missing_metadata',
  'late_upload',
] as const;
export type CheckType = (typeof CHECK_TYPES)[number];

export const REVIEW_DECISIONS = ['approve', 'reject'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const PROJECT_STATUSES = ['active', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const REPORT_STATUSES = ['generating', 'ready', 'failed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const RESOURCE_TYPES = ['image', 'video'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const TAGGING_PROVIDERS = ['cloudinary', 'gemini', 'none'] as const;
export type TaggingProvider = (typeof TAGGING_PROVIDERS)[number];

export const EVENT_TYPES = [
  'asset.created',
  'asset.rescored',
  'asset.reviewed',
  'asset.enriched',
  'report.created',
  'settings.updated',
  'site.gap_changed',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Size of the stored Gemini text embeddings (pgvector HNSW supports up to 2,000). */
export const EMBEDDING_DIMENSIONS = 768;
