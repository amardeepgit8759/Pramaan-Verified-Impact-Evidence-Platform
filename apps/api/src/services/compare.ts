import { formatDay, isReportEligible, type Asset, type CompareResponse } from '@pramaan/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { assets } from '../db/schema.js';
import { HttpError } from '../http-error.js';
import { listAssetRows } from './asset-views.js';
import type { MediaStore } from './media.js';

/** When the photo shows: capture time, or upload time when the file has none. */
const when = (a: Asset) => a.capturedAt ?? a.uploadedAt;

/**
 * Before/after for one site. With no picks, suggests the earliest and latest verified
 * photos. Picks must be photos from this site. Always returns the site's photos to choose
 * from, oldest first.
 */
export async function compareForSite(
  db: Db,
  media: MediaStore,
  orgId: string,
  siteId: string,
  picks: { before?: string; after?: string },
): Promise<CompareResponse> {
  const photos = (
    await listAssetRows(
      db,
      media,
      and(eq(assets.orgId, orgId), eq(assets.siteId, siteId), eq(assets.resourceType, 'image')),
      { order: 'oldest' },
    )
  ).sort((a, b) => when(a).localeCompare(when(b)));

  const pick = (id: string | undefined) => {
    if (!id) return null;
    const found = photos.find((p) => p.id === id);
    if (!found) throw new HttpError(404, 'That photo isn’t one of this site’s photos');
    return found;
  };

  let before = pick(picks.before);
  let after = pick(picks.after);
  let suggested = false;
  if (!before && !after) {
    const verified = photos.filter((p) => isReportEligible(p.trustBand, p.reviewDecision));
    if (verified.length >= 2) {
      before = verified[0]!;
      after = verified[verified.length - 1]!;
      suggested = true;
    }
  }

  let compositeUrl: string | null = null;
  if (before && after && before.id !== after.id) {
    const ids = await db
      .select({ id: assets.id, publicId: assets.cloudinaryPublicId })
      .from(assets)
      .where(inArray(assets.id, [before.id, after.id]));
    const publicId = (id: string) => ids.find((r) => r.id === id)!.publicId;
    compositeUrl = media.compositeUrl(
      { publicId: publicId(before.id), date: formatDay(new Date(when(before))) },
      { publicId: publicId(after.id), date: formatDay(new Date(when(after))) },
    );
  }

  return { candidates: photos, before, after, compositeUrl, suggested };
}
