/**
 * Test doubles for the service boundaries (Cloudinary and Gemini). They live only in
 * tests; production code always uses the real clients.
 */
import type { ReportDraft, ReportFacts, ResourceType } from '@pramaan/shared';
import { EMBEDDING_DIMENSIONS } from '@pramaan/shared';
import type { AiClient, VisionResult } from '../src/services/ai.js';
import {
  TaggingUnavailableError,
  type CloudinaryResource,
  type MediaStore,
} from '../src/services/media.js';
import { makeJpegWithExif } from './sample-image.js';

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

  compositeUrl(
    before: { publicId: string; date: string },
    after: { publicId: string; date: string },
  ) {
    return `https://res.cloudinary.com/test/image/upload/composite/${before.publicId}|${after.publicId}|${before.date}|${after.date}`;
  }

  /** Stills served to the PDF renderer; set to null to simulate Cloudinary being unreachable. */
  still: Buffer | null = makeJpegWithExif({
    lat: 28.47,
    lng: 77.03,
    capturedAt: '2024:03:10 09:00:00',
    size: 64,
  });
  stillRequests: string[] = [];

  async fetchStill(publicId: string) {
    this.stillRequests.push(publicId);
    return this.still;
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
  /** The report the "model" writes: a fixed draft, an error, or (by default) one built from the facts. */
  report: ReportDraft | Error | ((facts: ReportFacts) => ReportDraft) = draftFromFacts;
  /** When set, report generation waits for it, so tests can see the "generating" state. */
  reportGate: Promise<void> | null = null;
  reportFacts: ReportFacts[] = [];

  async generateReport(facts: ReportFacts) {
    this.reportFacts.push(facts);
    if (this.reportGate) await this.reportGate;
    if (this.report instanceof Error) throw this.report;
    return typeof this.report === 'function' ? this.report(facts) : this.report;
  }

  async describeImage(imageUrl: string) {
    this.describedUrls.push(imageUrl);
    if (this.vision instanceof Error) throw this.vision;
    return this.vision;
  }

  async embed(text: string) {
    this.embeddedTexts.push(text);
    if (this.embedError) throw this.embedError;
    // Bag-of-words: each word adds to one hashed dimension, so texts that share words point
    // the same way. Enough to test ranking; the live test checks real semantic quality.
    const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      let h = 2166136261;
      for (const ch of word) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
      v[h % EMBEDDING_DIMENSIONS]! += 1;
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  }
}

/**
 * A plausible report built only from the facts, like the real model is told to write, plus
 * one uncited sentence that validation must drop.
 */
export function draftFromFacts(facts: ReportFacts): ReportDraft {
  return {
    summary: `${facts.totals.evidence} verified evidence files document the work between ${facts.period.start} and ${facts.period.end}.`,
    sections: [
      {
        heading: 'Evidence by site',
        claims: facts.per_site.map((s) => ({
          sentence: `${s.count} verified evidence files were captured at ${s.site}.`,
          asset_ids: s.asset_ids,
        })),
      },
      ...(facts.before_after.length > 0
        ? [
            {
              heading: 'Progress over time',
              claims: facts.before_after.map((p) => ({
                sentence: `${p.site} was photographed on ${p.before.date} and again on ${p.after.date}.`,
                asset_ids: [p.before.asset_id, p.after.asset_id],
              })),
            },
          ]
        : []),
      {
        heading: 'Outcomes',
        claims: [
          { sentence: 'Every household in the district now has clean water.', asset_ids: [] },
        ],
      },
    ],
  };
}
