import type { ReviewInput } from '@pramaan/shared';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { SessionUser } from '../auth/session.js';
import type { Db } from '../db/client.js';
import { assets, projects, reviews } from '../db/schema.js';
import { HttpError } from '../http-error.js';
import { recordEvent } from './events.js';
import { refreshGaps } from './gaps.js';

/**
 * An admin's decision on evidence that isn't verified. Appends to the review log (never
 * edits it), keeps the Trust Score as it was, and records the latest decision on the asset
 * so approved evidence becomes eligible for reports.
 */
export async function reviewAsset(db: Db, user: SessionUser, assetId: unknown, input: ReviewInput) {
  const id = z.uuid().safeParse(assetId);
  const [row] = id.success
    ? await db
        .select({ asset: assets, projectName: projects.name })
        .from(assets)
        .innerJoin(projects, eq(projects.id, assets.projectId))
        .where(and(eq(assets.id, id.data), eq(assets.orgId, user.orgId)))
    : [];
  if (!row) throw new HttpError(404, 'Evidence not found');
  const { asset } = row;
  if (asset.trustBand === 'verified') {
    throw new HttpError(
      409,
      'Only evidence that needs review or is flagged can be approved or rejected',
    );
  }

  await db.transaction(async (tx) => {
    await tx.insert(reviews).values({
      assetId: asset.id,
      reviewerId: user.id,
      decision: input.decision,
      note: input.note,
      trustScoreAtReview: asset.trustScore,
    });
    await tx
      .update(assets)
      .set({ reviewDecision: input.decision, updatedAt: new Date() })
      .where(eq(assets.id, asset.id));
    await recordEvent(tx, user.orgId, 'asset.reviewed', {
      assetId: asset.id,
      projectId: asset.projectId,
      projectName: row.projectName,
      decision: input.decision,
      band: asset.trustBand,
      score: asset.trustScore,
      actorId: user.id,
      actorName: user.name,
    });
  });
  await refreshGaps(db, user.orgId);
}
