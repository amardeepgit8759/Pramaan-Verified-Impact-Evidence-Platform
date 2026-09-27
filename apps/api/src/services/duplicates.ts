import type { DuplicateCandidate } from '@pramaan/shared';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';

export interface DuplicateQuery {
  orgId: string;
  projectId: string;
  /** Null when scoring an asset that hasn't been inserted yet. */
  assetId: string | null;
  etag: string;
  /** 64-character bit string, or null for files without a perceptual hash. */
  phash: string | null;
  phashThreshold: number;
}

/**
 * Find the organization's assets that could make this one a duplicate: anything with the
 * same etag (any project), plus anything in another project whose pHash is within the
 * Hamming-distance threshold. The distance is computed in Postgres with bit_count(a # b).
 */
export async function findDuplicateCandidates(
  db: Db,
  q: DuplicateQuery,
): Promise<DuplicateCandidate[]> {
  const nearMatch =
    q.phash === null
      ? sql`false`
      : sql`(a.project_id <> ${q.projectId}
             and a.phash is not null
             and bit_count(a.phash # ${q.phash}::bit(64)) <= ${q.phashThreshold})`;

  const { rows } = await db.execute<{
    id: string;
    project_id: string;
    project_name: string;
    etag: string;
    phash: string | null;
    uploaded_at: Date | string;
  }>(sql`
    select a.id, a.project_id, p.name as project_name, a.etag, a.phash::text as phash, a.uploaded_at
    from assets a
    join projects p on p.id = a.project_id
    where a.org_id = ${q.orgId}
      and a.id is distinct from ${q.assetId}::uuid
      and (a.etag = ${q.etag} or ${nearMatch})
    order by a.uploaded_at
  `);

  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    etag: r.etag,
    phash: r.phash,
    uploadedAt: new Date(r.uploaded_at),
  }));
}
