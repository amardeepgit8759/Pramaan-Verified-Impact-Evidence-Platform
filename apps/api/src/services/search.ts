import type { SearchQuery, SearchResponse, SearchResult } from '@pramaan/shared';
import { searchQuery } from '@pramaan/shared';
import { and, eq, gte, inArray, isNotNull, lt, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { assets } from '../db/schema.js';
import type { Logger } from '../logger.js';
import type { AiClient } from './ai.js';
import { listAssetRows } from './asset-views.js';
import type { MediaStore } from './media.js';

/** Words worth matching on: lower-case, two letters or more. */
export function keywordTerms(q: string): string[] {
  return [
    ...new Set(
      q
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 2),
    ),
  ];
}

/**
 * Semantic search over the organisation's evidence: embed the query, rank by pgvector
 * cosine distance within the filters, then add keyword matches on tags and caption that the
 * vector search didn't return (e.g. assets whose embedding failed). If the query can't be
 * embedded, keyword matching alone answers it.
 */
export async function searchEvidence(
  deps: { db: Db; ai: AiClient; media: MediaStore; logger: Logger },
  orgId: string,
  input: SearchQuery,
): Promise<SearchResponse> {
  const q = searchQuery.parse(input);
  const { db } = deps;

  const filters: SQL[] = [eq(assets.orgId, orgId)];
  if (q.projectId) filters.push(eq(assets.projectId, q.projectId));
  if (q.band) filters.push(eq(assets.trustBand, q.band));
  if (q.from) filters.push(gte(assets.capturedAt, new Date(`${q.from}T00:00:00Z`)));
  if (q.to) {
    const end = new Date(`${q.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    filters.push(lt(assets.capturedAt, end));
  }

  let vector: number[] | null = null;
  try {
    vector = await deps.ai.embed(q.q);
  } catch (err) {
    deps.logger.warn(
      { reason: (err as Error).message },
      'Query embedding failed; keyword search only',
    );
  }

  const scored: { id: string; score: number; match: SearchResult['match'] }[] = [];
  if (vector) {
    const literal = `[${vector.join(',')}]`;
    const distance = sql`${assets.embedding} <=> ${literal}::vector`;
    const rows = await db
      .select({ id: assets.id, score: sql<number>`1 - (${distance})` })
      .from(assets)
      .where(and(...filters, isNotNull(assets.embedding)))
      .orderBy(distance)
      .limit(q.limit);
    for (const r of rows) {
      scored.push({
        id: r.id,
        score: Math.round(Number(r.score) * 1000) / 1000,
        match: 'semantic',
      });
    }
  }

  const terms = keywordTerms(q.q);
  if (terms.length > 0 && scored.length < q.limit) {
    const patterns = terms.map((t) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const anyTerm = sql.join(
      patterns.map(
        (p) =>
          sql`(${assets.caption} ilike ${p} or exists (select 1 from unnest(${assets.tags}) as tag where tag ilike ${p}))`,
      ),
      sql` or `,
    );
    const rows = await db
      .select({ id: assets.id, caption: assets.caption, tags: assets.tags })
      .from(assets)
      .where(and(...filters, sql`(${anyTerm})`))
      .limit(200);
    const seen = new Set(scored.map((s) => s.id));
    const keyword = rows
      .filter((r) => !seen.has(r.id))
      .map((r) => {
        const text = `${r.caption ?? ''} ${r.tags.join(' ')}`.toLowerCase();
        const found = terms.filter((t) => text.includes(t)).length;
        return {
          id: r.id,
          score: Math.round((found / terms.length) * 1000) / 1000,
          match: 'keyword' as const,
        };
      })
      .sort((a, b) => b.score - a.score);
    scored.push(...keyword.slice(0, q.limit - scored.length));
  }

  if (scored.length === 0) return { mode: vector ? 'semantic' : 'keyword', results: [] };
  const found = await listAssetRows(
    deps.db,
    deps.media,
    inArray(
      assets.id,
      scored.map((s) => s.id),
    ),
    { order: 'newest' },
  );
  const byId = new Map(found.map((a) => [a.id, a]));
  return {
    mode: vector ? 'semantic' : 'keyword',
    results: scored.flatMap((s) => {
      const asset = byId.get(s.id);
      return asset ? [{ asset, score: s.score, match: s.match }] : [];
    }),
  };
}

/** The organisation's most-used tags: real example searches for the search page. */
export async function topTags(db: Db, orgId: string, limit = 12) {
  const { rows } = await db.execute<{ tag: string; count: number }>(sql`
    select tag, count(*)::int as count
    from assets, unnest(assets.tags) as tag
    where assets.org_id = ${orgId}
    group by tag
    order by count(*) desc, tag
    limit ${limit}
  `);
  return rows;
}
