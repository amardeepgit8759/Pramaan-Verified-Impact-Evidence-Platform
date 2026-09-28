import { z } from 'zod';
import { TRUST_BANDS } from '../domain.js';
import { assetSchema } from './assets.js';

const isoDate = z.iso.date();

export const searchQuery = z.object({
  q: z.string().trim().min(1, 'Type something to search for').max(200),
  projectId: z.uuid().optional(),
  band: z.enum(TRUST_BANDS).optional(),
  /** Capture-date range, inclusive. */
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});
export type SearchQuery = z.input<typeof searchQuery>;

export const searchResultSchema = z.object({
  asset: assetSchema,
  /** 0–1. Cosine similarity for semantic matches; share of query words found for keyword ones. */
  score: z.number(),
  match: z.enum(['semantic', 'keyword']),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponse = z.object({
  /** "keyword" when the query couldn't be embedded (e.g. the AI service is down). */
  mode: z.enum(['semantic', 'keyword']),
  results: z.array(searchResultSchema),
});
export type SearchResponse = z.infer<typeof searchResponse>;

export const searchSuggestionsResponse = z.object({
  tags: z.array(z.object({ tag: z.string(), count: z.number().int() })),
});

export const compareResponse = z.object({
  /** The site's photos, oldest first, to pick from. */
  candidates: z.array(assetSchema),
  before: assetSchema.nullable(),
  after: assetSchema.nullable(),
  /** Side-by-side image of the pair, built by Cloudinary; null without a pair. */
  compositeUrl: z.string().nullable(),
  /** True when the pair is the automatic earliest/latest verified suggestion. */
  suggested: z.boolean(),
});
export type CompareResponse = z.infer<typeof compareResponse>;
