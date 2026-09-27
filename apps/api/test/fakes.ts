/**
 * Test doubles for the service boundaries (Cloudinary and Gemini). They live only in
 * tests; production code always uses the real clients.
 */
import type { ResourceType } from '@pramaan/shared';
import { EMBEDDING_DIMENSIONS } from '@pramaan/shared';
import type { AiClient, VisionResult } from '../src/services/ai.js';
import {
  TaggingUnavailableError,
  type CloudinaryResource,
  type MediaStore,
} from '../src/services/media.js';

export class FakeMediaStore implements MediaStore {
  resources = new Map<string, CloudinaryResource>();
  /** Tags the "add-on" returns, or an error to simulate it being unavailable. */
  autoTagResult: string[] | Error = [];
  writeBacks: { publicId: string; context: Record<string, string> }[] = [];
  signed: { folder: string; context: Record<string, string> }[] = [];

  /** Pretend the browser uploaded this file. */
  addUpload(resource: Partial<CloudinaryResource> & { publicId: string }) {
    this.resources.set(resource.publicId, {
      resourceType: 'image',
      format: 'jpg',
      width: 1200,
      height: 900,
      bytes: 204_800,
      secureUrl: `https://res.cloudinary.com/test/image/upload/${resource.publicId}.jpg`,
      etag: `etag-${resource.publicId}`,
      phash: null,
      createdAt: new Date(),
      originalFilename: 'photo',
      tags: [],
      metadata: {},
      ...resource,
    });
  }

  async signUpload(input: { folder: string; context: Record<string, string> }) {
    this.signed.push(input);
    return {
      uploadUrl: 'https://api.cloudinary.com/v1_1/test/auto/upload',
      params: { folder: input.folder, timestamp: '1', signature: 'sig', api_key: 'key' },
    };
  }

  async getResource(publicId: string, _resourceType: ResourceType) {
    return this.resources.get(publicId) ?? null;
  }

  async autoTag(_publicId: string) {
    if (this.autoTagResult instanceof Error) {
      throw new TaggingUnavailableError(this.autoTagResult.message);
    }
    return this.autoTagResult;
  }

  async writeBack(publicId: string, _resourceType: ResourceType, context: Record<string, string>) {
    this.writeBacks.push({ publicId, context });
  }

  thumbnailUrl(publicId: string) {
    return `https://res.cloudinary.com/test/image/upload/c_fill,w_480/${publicId}`;
  }

  previewUrl(publicId: string) {
    return `https://res.cloudinary.com/test/image/upload/w_1600/${publicId}`;
  }

  async destroy(publicId: string) {
    this.resources.delete(publicId);
  }
}

export class FakeAiClient implements AiClient {
  vision: VisionResult | Error = { caption: 'A hand pump in a village.', tags: ['water pump'] };
  embedError: Error | null = null;
  describedUrls: string[] = [];
  embeddedTexts: string[] = [];

  async describeImage(imageUrl: string) {
    this.describedUrls.push(imageUrl);
    if (this.vision instanceof Error) throw this.vision;
    return this.vision;
  }

  async embed(text: string) {
    this.embeddedTexts.push(text);
    if (this.embedError) throw this.embedError;
    // Deterministic, unit-length vector derived from the text.
    const v = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => Math.sin(i + text.length));
    const norm = Math.hypot(...v);
    return v.map((x) => x / norm);
  }
}
