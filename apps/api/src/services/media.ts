import type { ResourceType, UploadSignatureResponse } from '@pramaan/shared';
import { v2 as cloudinary } from 'cloudinary';
import type { Env } from '../env.js';
import type { Logger } from '../logger.js';

/** What the server trusts about an uploaded file: always read back from Cloudinary. */
export interface CloudinaryResource {
  publicId: string;
  resourceType: ResourceType;
  format: string;
  width: number | null;
  height: number | null;
  bytes: number;
  secureUrl: string;
  etag: string;
  /** 16 hex digits; images only. */
  phash: string | null;
  createdAt: Date;
  originalFilename: string | null;
  tags: string[];
  /** Raw `media_metadata` (or the older `image_metadata`) object. */
  metadata: unknown;
}

export class TaggingUnavailableError extends Error {
  override name = 'TaggingUnavailableError';
}

/**
 * The only way the API talks to Cloudinary. Tests replace it with a fake; the real
 * implementation is below.
 */
export interface MediaStore {
  signUpload(input: {
    folder: string;
    context: Record<string, string>;
  }): Promise<UploadSignatureResponse>;
  getResource(publicId: string, resourceType: ResourceType): Promise<CloudinaryResource | null>;
  /** Run the auto-tagging add-on on an uploaded image. Throws TaggingUnavailableError. */
  autoTag(publicId: string): Promise<string[]>;
  /** Best-effort: record Pramaan's view (project, site, score) on the Cloudinary asset. */
  writeBack(
    publicId: string,
    resourceType: ResourceType,
    context: Record<string, string>,
  ): Promise<void>;
  /** `aspect` is width/height; thumbnails are cropped around the subject to it. */
  thumbnailUrl(publicId: string, resourceType: ResourceType, aspect?: number): string;
  previewUrl(publicId: string, resourceType: ResourceType): string;
  destroy(publicId: string, resourceType: ResourceType): Promise<void>;
}

/** Grid thumbnails: wide enough for 2x screens in a 3–4 column masonry. */
const THUMB_WIDTH = 480;

/** Formats a field phone or camera produces; anything else is refused at upload. */
const ALLOWED_FORMATS = 'jpg,jpeg,png,webp,heic,heif,avif,mp4,mov,webm,3gp';

/** After the tagging add-on fails, skip it for a while instead of failing every upload. */
const TAGGING_RETRY_MS = 60 * 60_000;

/** Context values can't contain the separators Cloudinary uses. */
const contextString = (context: Record<string, string>) =>
  Object.entries(context)
    .map(([k, v]) => `${k}=${v.replace(/[|=]/g, ' ')}`)
    .join('|');

function httpCode(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const inner = 'error' in err ? (err as { error: unknown }).error : err;
  return typeof inner === 'object' && inner !== null && 'http_code' in inner
    ? Number((inner as { http_code: unknown }).http_code)
    : undefined;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'error' in err) {
    const inner = (err as { error: { message?: string } }).error;
    if (inner?.message) return inner.message;
  }
  return String(err);
}

export class CloudinaryMediaStore implements MediaStore {
  private folderMode: Promise<'dynamic' | 'fixed'> | null = null;
  private taggingUnavailableUntil = 0;

  constructor(
    private readonly env: Pick<
      Env,
      | 'CLOUDINARY_CLOUD_NAME'
      | 'CLOUDINARY_API_KEY'
      | 'CLOUDINARY_API_SECRET'
      | 'CLOUDINARY_TAGGING_ADDON'
      | 'CLOUDINARY_AUTO_TAGGING_MIN_CONFIDENCE'
    >,
    private readonly logger: Logger,
  ) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  /**
   * Accounts created since 2023 use dynamic folders, where `folder` is legacy. Ask once;
   * if the check fails, `folder` still works in both modes.
   */
  private getFolderMode() {
    this.folderMode ??= cloudinary.api
      .config({ settings: true })
      .then((res): 'dynamic' | 'fixed' =>
        res.settings?.folder_mode === 'dynamic' ? 'dynamic' : 'fixed',
      )
      .catch((err: unknown) => {
        this.logger.warn({ err: errorMessage(err) }, 'Could not read Cloudinary folder mode');
        this.folderMode = null;
        return 'fixed' as const;
      });
    return this.folderMode;
  }

  async signUpload({ folder, context }: { folder: string; context: Record<string, string> }) {
    const placement: Record<string, string> =
      (await this.getFolderMode()) === 'dynamic'
        ? { asset_folder: folder, public_id_prefix: folder }
        : { folder };
    const params: Record<string, string> = {
      ...placement,
      context: contextString(context),
      phash: 'true',
      media_metadata: 'true',
      allowed_formats: ALLOWED_FORMATS,
      timestamp: String(Math.round(Date.now() / 1000)),
    };
    const signature = cloudinary.utils.api_sign_request(params, this.env.CLOUDINARY_API_SECRET);
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
      params: { ...params, api_key: this.env.CLOUDINARY_API_KEY, signature },
    };
  }

  async getResource(publicId: string, resourceType: ResourceType) {
    try {
      const r = await cloudinary.api.resource(publicId, {
        resource_type: resourceType,
        phash: true,
        media_metadata: true,
      });
      return {
        publicId: r.public_id,
        resourceType: r.resource_type === 'video' ? 'video' : 'image',
        format: r.format,
        width: r.width ?? null,
        height: r.height ?? null,
        bytes: r.bytes,
        secureUrl: r.secure_url,
        etag: r.etag,
        phash: typeof r.phash === 'string' ? r.phash : null,
        createdAt: new Date(r.created_at),
        originalFilename: r.original_filename ?? r.display_name ?? null,
        tags: Array.isArray(r.tags) ? r.tags : [],
        metadata: r.media_metadata ?? r.image_metadata ?? null,
      } satisfies CloudinaryResource;
    } catch (err) {
      if (httpCode(err) === 404) return null;
      throw err;
    }
  }

  async autoTag(publicId: string) {
    const addon = this.env.CLOUDINARY_TAGGING_ADDON;
    if (Date.now() < this.taggingUnavailableUntil) {
      throw new TaggingUnavailableError(`${addon} recently failed; not retrying yet`);
    }
    try {
      const res = await cloudinary.api.update(publicId, {
        categorization: addon,
        auto_tagging: this.env.CLOUDINARY_AUTO_TAGGING_MIN_CONFIDENCE,
      });
      const result = res?.info?.categorization?.[addon];
      if (result?.status !== 'complete' || !Array.isArray(result.data)) {
        throw new TaggingUnavailableError(`${addon} returned status "${result?.status}"`);
      }
      return (result.data as { tag: string; confidence: number }[])
        .filter((d) => d.confidence >= this.env.CLOUDINARY_AUTO_TAGGING_MIN_CONFIDENCE)
        .map((d) => d.tag.toLowerCase());
    } catch (err) {
      if (err instanceof TaggingUnavailableError) throw err;
      // Not enabled, out of quota, or not allowed on this plan: fall back for a while.
      this.taggingUnavailableUntil = Date.now() + TAGGING_RETRY_MS;
      throw new TaggingUnavailableError(`${addon} failed: ${errorMessage(err)}`);
    }
  }

  async writeBack(publicId: string, resourceType: ResourceType, context: Record<string, string>) {
    await cloudinary.api.update(publicId, {
      resource_type: resourceType,
      context: contextString(context),
    });
  }

  thumbnailUrl(publicId: string, resourceType: ResourceType, aspect = 1) {
    return cloudinary.url(publicId, {
      resource_type: resourceType,
      secure: true,
      format: resourceType === 'video' ? 'jpg' : undefined,
      transformation: [
        ...(resourceType === 'video' ? [{ start_offset: 'auto' }] : []),
        {
          width: THUMB_WIDTH,
          height: Math.round(THUMB_WIDTH / aspect),
          crop: 'fill',
          gravity: 'auto',
        },
        { fetch_format: 'auto', quality: 'auto' },
      ],
    });
  }

  previewUrl(publicId: string, resourceType: ResourceType) {
    return cloudinary.url(publicId, {
      resource_type: resourceType,
      secure: true,
      format: resourceType === 'video' ? 'jpg' : undefined,
      transformation: [
        ...(resourceType === 'video' ? [{ start_offset: 'auto' }] : []),
        { width: 1600, crop: 'limit' },
        { fetch_format: 'auto', quality: 'auto' },
      ],
    });
  }

  async destroy(publicId: string, resourceType: ResourceType) {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
  }
}
