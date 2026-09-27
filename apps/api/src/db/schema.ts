import {
  CHECK_TYPES,
  EMBEDDING_DIMENSIONS,
  PROJECT_STATUSES,
  REPORT_STATUSES,
  RESOURCE_TYPES,
  REVIEW_DECISIONS,
  TAGGING_PROVIDERS,
  TRUST_BANDS,
  USER_ROLES,
  type TrustCheckResult,
  type TrustWeights,
} from '@pramaan/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  bit,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

// Migrations in ../../drizzle are generated from this file with `pnpm db:generate`.

export const userRole = pgEnum('user_role', USER_ROLES);
export const trustBand = pgEnum('trust_band', TRUST_BANDS);
export const checkType = pgEnum('check_type', CHECK_TYPES);
export const reviewDecision = pgEnum('review_decision', REVIEW_DECISIONS);
export const projectStatus = pgEnum('project_status', PROJECT_STATUSES);
export const reportStatus = pgEnum('report_status', REPORT_STATUSES);
export const resourceType = pgEnum('resource_type', RESOURCE_TYPES);
export const taggingProvider = pgEnum('tagging_provider', TAGGING_PROVIDERS);

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export const users = pgTable(
  'users',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Always stored lower-cased. */
    email: text('email').notNull().unique(),
    /** Null until an invited user sets a password. */
    passwordHash: text('password_hash'),
    role: userRole('role').notNull(),
    /** SHA-256 of the one-time password-set token sent to invited users. */
    inviteTokenHash: text('invite_token_hash'),
    inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
    /** Removed from the team. Kept (not deleted) so the review audit log keeps its reviewer. */
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('users_org_id_idx').on(t.orgId)],
);

export const settings = pgTable('settings', {
  orgId: uuid('org_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  weights: jsonb('weights').$type<TrustWeights>().notNull(),
  phashThreshold: integer('phash_threshold').notNull(),
  lateUploadDays: integer('late_upload_days').notNull(),
  gapDays: integer('gap_days').notNull(),
  bandVerifiedMin: integer('band_verified_min').notNull(),
  bandReviewMin: integer('band_review_min').notNull(),
  duplicateBurstDays: integer('duplicate_burst_days').notNull(),
  farLocationMultiplier: integer('far_location_multiplier').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  'projects',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    /** Null while the project is ongoing. */
    endDate: date('end_date', { mode: 'string' }),
    sdgGoals: integer('sdg_goals')
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    csrCategory: text('csr_category'),
    status: projectStatus('status').notNull().default('active'),
    createdAt: createdAt(),
  },
  (t) => [index('projects_org_id_idx').on(t.orgId)],
);

export const sites = pgTable(
  'sites',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    radiusM: integer('radius_m').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sites_project_id_idx').on(t.projectId)],
);

export const assets = pgTable(
  'assets',
  {
    // Identity
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),

    // Cloudinary (always re-fetched server-side, never taken from the client)
    cloudinaryPublicId: text('cloudinary_public_id').notNull().unique(),
    resourceType: resourceType('resource_type').notNull(),
    format: text('format').notNull(),
    width: integer('width'),
    height: integer('height'),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
    secureUrl: text('secure_url').notNull(),
    originalFilename: text('original_filename'),

    // Fingerprints
    etag: text('etag').notNull(),
    /** 64-bit perceptual hash; null for videos. */
    phash: bit('phash', { dimensions: 64 }),

    // Capture data
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    /** The raw EXIF fields the capture data was read from, kept for transparency. */
    exif: jsonb('exif').$type<Record<string, string>>().notNull().default({}),

    // Content
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    taggingProvider: taggingProvider('tagging_provider').notNull().default('none'),
    caption: text('caption'),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),

    // Scoring
    trustScore: integer('trust_score').notNull(),
    trustBand: trustBand('trust_band').notNull(),
    /** Latest decision from the append-only `reviews` log, denormalized for filtering. */
    reviewDecision: reviewDecision('review_decision'),

    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('assets_org_id_idx').on(t.orgId),
    index('assets_project_captured_idx').on(t.projectId, t.capturedAt),
    index('assets_site_id_idx').on(t.siteId),
    index('assets_etag_idx').on(t.etag),
    index('assets_embedding_hnsw_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

export const trustChecks = pgTable(
  'trust_checks',
  {
    id: id(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    checkType: checkType('check_type').notNull(),
    passed: boolean('passed').notNull(),
    deduction: integer('deduction').notNull(),
    /** Plain-language explanation, e.g. "Taken 41.2 km from Village Rampur". */
    reason: text('reason').notNull(),
    detail: jsonb('detail').$type<TrustCheckResult['detail']>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('trust_checks_asset_type_idx').on(t.assetId, t.checkType)],
);

export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => users.id),
    decision: reviewDecision('decision').notNull(),
    note: text('note').notNull(),
    /** The asset's score when the decision was made, so the annex shows what was reviewed. */
    trustScoreAtReview: integer('trust_score_at_review').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('reviews_asset_id_idx').on(t.assetId, t.createdAt)],
);

export const reports = pgTable(
  'reports',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    status: reportStatus('status').notNull().default('generating'),
    summary: text('summary'),
    /** Claims the model produced that failed citation checks and were discarded. */
    droppedClaims: integer('dropped_claims').notNull().default(0),
    error: text('error'),
    generatedBy: uuid('generated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('reports_project_id_idx').on(t.projectId, t.createdAt)],
);

export const reportClaims = pgTable(
  'report_claims',
  {
    id: id(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    section: text('section').notNull(),
    sentence: text('sentence').notNull(),
    assetIds: uuid('asset_ids').array().notNull(),
  },
  (t) => [uniqueIndex('report_claims_position_idx').on(t.reportId, t.position)],
);

export const shareLinks = pgTable(
  'share_links',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('share_links_project_id_idx').on(t.projectId)],
);

export const events = pgTable(
  'events',
  {
    /** Monotonic, so SSE clients can resume with Last-Event-ID. */
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('events_org_id_idx').on(t.orgId, t.id)],
);
