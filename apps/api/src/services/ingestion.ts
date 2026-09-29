import {
  buildEmbeddingText,
  comparisonSite,
  computeTrustScore,
  extractCaptureData,
  nearestSiteWithin,
  phashFromHex,
  type ConfirmUploadInput,
  type TaggingProvider,
} from '@pramaan/shared';
import { and, eq } from 'drizzle-orm';
import type { SessionUser } from '../auth/session.js';
import type { Db } from '../db/client.js';
import { assets, sites, trustChecks } from '../db/schema.js';
import type { Env } from '../env.js';
import { HttpError } from '../http-error.js';
import type { Logger } from '../logger.js';
import { requireProject } from './access.js';
import type { AiClient } from './ai.js';
import { findDuplicateCandidates } from './duplicates.js';
import { refreshGaps } from './gaps.js';
import { recordEvent } from './events.js';
import type { CloudinaryResource, MediaStore } from './media.js';
import { dayToDate, rescoreAssets } from './scoring.js';
import { getOrgSettings } from './settings.js';

export interface IngestDeps {
  db: Db;
  env: Pick<Env, 'CLOUDINARY_UPLOAD_FOLDER' | 'TAGGING_PROVIDER'>;
  media: MediaStore;
  ai: AiClient;
  logger: Logger;
  /** Streams asset.enriched once tags and a caption are added in the background. */
  live?: { poke(): void };
  /** Tests: finish tagging and captioning before confirm responds. */
  awaitEnrichment?: boolean;
}

/** Every upload for a project lands under pramaan/{orgId}/{projectId}. */
export const uploadFolder = (env: IngestDeps['env'], orgId: string, projectId: string) =>
  `${env.CLOUDINARY_UPLOAD_FOLDER}/${orgId}/${projectId}`;

export async function requireSiteInProject(db: Db, projectId: string, siteId: string) {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.projectId, projectId)));
  if (!site) throw new HttpError(404, 'Site not found in this project');
  return site;
}

/**
 * Tags from the Cloudinary add-on when that's the provider and it works; otherwise a
 * Gemini caption and tags. Which one was used is stored and logged per asset.
 */
async function tagAndCaption(deps: IngestDeps, resource: CloudinaryResource) {
  let tags: string[] = [];
  let caption: string | null = null;
  let provider: TaggingProvider = 'none';

  if (deps.env.TAGGING_PROVIDER === 'cloudinary' && resource.resourceType === 'image') {
    try {
      tags = await deps.media.autoTag(resource.publicId);
      if (tags.length > 0) provider = 'cloudinary';
    } catch (err) {
      deps.logger.warn(
        { publicId: resource.publicId, reason: (err as Error).message },
        'Cloudinary auto-tagging unavailable; falling back to Gemini',
      );
    }
  }
  if (tags.length === 0) {
    try {
      const vision = await deps.ai.describeImage(
        deps.media.previewUrl(resource.publicId, resource.resourceType),
      );
      tags = vision.tags;
      caption = vision.caption;
      provider = 'gemini';
    } catch (err) {
      deps.logger.warn(
        { publicId: resource.publicId, reason: (err as Error).message },
        'Gemini captioning failed; storing the asset without tags',
      );
    }
  }
  deps.logger.info(
    { publicId: resource.publicId, provider, tagCount: tags.length },
    'Tagged asset',
  );
  return { tags, caption, provider };
}

async function embedSafely(deps: IngestDeps, text: string) {
  try {
    return await deps.ai.embed(text);
  } catch (err) {
    // Semantic search falls back to keywords for this asset.
    deps.logger.warn({ reason: (err as Error).message }, 'Embedding failed');
    return null;
  }
}

/**
 * POST /api/assets/confirm: the browser has uploaded a file to Cloudinary; turn it into a
 * scored asset. Nothing the browser says about the file is trusted: it is re-fetched from
 * the Cloudinary Admin API. Returns the asset id (the same one if confirmed twice).
 */
export async function confirmUpload(
  deps: IngestDeps,
  user: SessionUser,
  input: ConfirmUploadInput & { resourceType: 'image' | 'video' },
): Promise<{ assetId: string; created: boolean }> {
  const { db } = deps;
  const project = await requireProject(db, user.orgId, input.projectId);
  let site = input.siteId ? await requireSiteInProject(db, project.id, input.siteId) : null;

  const [existing] = await db
    .select({ id: assets.id, orgId: assets.orgId })
    .from(assets)
    .where(eq(assets.cloudinaryPublicId, input.publicId));
  if (existing) {
    if (existing.orgId !== user.orgId) throw new HttpError(404, 'Upload not found');
    return { assetId: existing.id, created: false };
  }

  // The signed upload fixed the folder, so anything else wasn't uploaded for this project.
  if (!input.publicId.startsWith(`${uploadFolder(deps.env, user.orgId, project.id)}/`)) {
    throw new HttpError(400, 'This upload doesn’t belong to this project');
  }
  const resource = await deps.media.getResource(input.publicId, input.resourceType);
  if (!resource) throw new HttpError(404, 'Upload not found on Cloudinary');

  const capture = extractCaptureData(resource.metadata);
  const phash = resource.phash ? phashFromHex(resource.phash) : null;

  // No site chosen: use the nearest site whose radius contains the photo's GPS.
  const projectSites = await db.select().from(sites).where(eq(sites.projectId, project.id));
  if (!site && capture.lat !== null && capture.lng !== null) {
    site = nearestSiteWithin({ lat: capture.lat, lng: capture.lng }, projectSites)?.site ?? null;
  }

  const settings = await getOrgSettings(db, user.orgId);
  const candidates = await findDuplicateCandidates(db, {
    orgId: user.orgId,
    projectId: project.id,
    assetId: null,
    etag: resource.etag,
    phash,
    phashThreshold: settings.phashThreshold,
  });
  const score = computeTrustScore(
    {
      id: 'new',
      projectId: project.id,
      etag: resource.etag,
      phash,
      capturedAt: capture.capturedAt,
      uploadedAt: resource.createdAt,
      lat: capture.lat,
      lng: capture.lng,
    },
    candidates,
    {
      id: project.id,
      name: project.name,
      startDate: dayToDate(project.startDate),
      endDate: project.endDate ? dayToDate(project.endDate) : null,
    },
    // Outside every site: still checked, against the closest one, so it can't skip the check.
    comparisonSite(site, capture, projectSites),
    settings,
  );

  const assetId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(assets)
      .values({
        orgId: user.orgId,
        projectId: project.id,
        siteId: site?.id ?? null,
        uploadedBy: user.id,
        cloudinaryPublicId: resource.publicId,
        resourceType: resource.resourceType,
        format: resource.format,
        width: resource.width,
        height: resource.height,
        bytes: resource.bytes,
        secureUrl: resource.secureUrl,
        originalFilename: resource.originalFilename,
        etag: resource.etag,
        phash,
        capturedAt: capture.capturedAt,
        lat: capture.lat,
        lng: capture.lng,
        exif: capture.sources,
        // Filled in by enrichAsset once the upload has been scored.
        tags: [],
        taggingProvider: 'none',
        caption: null,
        embedding: null,
        trustScore: score.score,
        trustBand: score.band,
        uploadedAt: resource.createdAt,
      })
      .returning({ id: assets.id });
    await tx.insert(trustChecks).values(
      score.checks.map((c) => ({
        assetId: row!.id,
        checkType: c.type,
        passed: c.passed,
        deduction: c.deduction,
        reason: c.reason,
        detail: c.detail,
      })),
    );
    await recordEvent(tx, user.orgId, 'asset.created', {
      assetId: row!.id,
      projectId: project.id,
      projectName: project.name,
      siteId: site?.id ?? null,
      siteName: site?.name ?? null,
      actorId: user.id,
      actorName: user.name,
      score: score.score,
      band: score.band,
    });
    return row!.id;
  });

  // A later copy makes the earlier asset suspicious too, so re-score everything it matches
  // (and this asset, in case two copies were confirmed at the same moment).
  const related = await findDuplicateCandidates(db, {
    orgId: user.orgId,
    projectId: project.id,
    assetId,
    etag: resource.etag,
    phash,
    phashThreshold: settings.phashThreshold,
  });
  if (related.length > 0) {
    await rescoreAssets(
      db,
      user.orgId,
      settings,
      { assetIds: [assetId, ...related.map((r) => r.id)] },
      { actor: user },
    );
  }

  try {
    const [stored] = await db
      .select({ score: assets.trustScore, band: assets.trustBand })
      .from(assets)
      .where(eq(assets.id, assetId));
    await deps.media.writeBack(resource.publicId, resource.resourceType, {
      pramaan_project_id: project.id,
      pramaan_site_id: site?.id ?? '',
      pramaan_trust_score: String(stored!.score),
      pramaan_trust_band: stored!.band,
    });
  } catch (err) {
    deps.logger.info(
      { publicId: resource.publicId, reason: (err as Error).message },
      'Skipped writing Pramaan data back to Cloudinary',
    );
  }

  await refreshGaps(db, user.orgId);

  const enrichment = enrichAsset(deps, {
    assetId,
    orgId: user.orgId,
    project,
    siteName: site?.name ?? null,
    resource,
    capturedAt: capture.capturedAt,
  });
  inFlight.add(enrichment);
  void enrichment.finally(() => inFlight.delete(enrichment));
  if (deps.awaitEnrichment) await enrichment;
  return { assetId, created: true };
}

const inFlight = new Set<Promise<void>>();

/** Resolves when every background enrichment started so far has finished (for tests). */
export async function enrichmentIdle() {
  await Promise.all(inFlight);
}

/**
 * Tags, caption and search embedding, added after the asset is scored and stored. The
 * Trust Score never depends on them, so an upload never waits on the AI (Gemini can take
 * a while, or be busy). Never throws; a failure leaves the asset untagged, and search
 * still finds it by keyword once tagged some other way.
 */
async function enrichAsset(
  deps: IngestDeps,
  a: {
    assetId: string;
    orgId: string;
    project: { id: string; name: string };
    siteName: string | null;
    resource: CloudinaryResource;
    capturedAt: Date | null;
  },
) {
  try {
    const { tags, caption, provider } = await tagAndCaption(deps, a.resource);
    const embedding = await embedSafely(
      deps,
      buildEmbeddingText({
        caption,
        tags,
        projectName: a.project.name,
        siteName: a.siteName,
        capturedAt: a.capturedAt,
      }),
    );
    await deps.db.transaction(async (tx) => {
      const updated = await tx
        .update(assets)
        .set({ tags, caption, taggingProvider: provider, embedding, updatedAt: new Date() })
        .where(eq(assets.id, a.assetId))
        .returning({ id: assets.id });
      // Deleted in the meantime: nothing to announce.
      if (updated.length === 0) return;
      await recordEvent(tx, a.orgId, 'asset.enriched', {
        assetId: a.assetId,
        projectId: a.project.id,
        projectName: a.project.name,
        taggingProvider: provider,
      });
    });
  } catch (err) {
    deps.logger.error({ err, assetId: a.assetId }, 'Adding tags and a caption failed');
  } finally {
    deps.live?.poke();
  }
}
