import { EMBEDDING_DIMENSIONS, type ReportDraft, type ReportFacts } from '@pramaan/shared';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { Env } from '../env.js';

export interface VisionResult {
  caption: string;
  tags: string[];
}

/**
 * The only way the API talks to Gemini. Tests replace it with a test double; the real
 * implementation is below. Model ids come from env, never from code.
 */
export interface AiClient {
  /** Caption and tag a still image (a photo, or a frame from a video). */
  describeImage(imageUrl: string): Promise<VisionResult>;
  /** Text embedding for semantic search, EMBEDDING_DIMENSIONS long. */
  embed(text: string): Promise<number[]>;
  /**
   * Draft a report from the given facts only. The result is structurally valid but
   * untrusted: citations are checked by validateReportDraft before anything is stored.
   */
  generateReport(facts: ReportFacts): Promise<ReportDraft>;
}

const MIN_TAGS = 5;
const MAX_TAGS = 15;

const visionSchema = z.object({
  caption: z.string().trim().min(1).max(300),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).min(1).max(30),
});

/** Plain JSON Schema for Gemini's structured output (kept simple: widely supported keywords). */
const visionJsonSchema = {
  type: 'object',
  properties: {
    caption: {
      type: 'string',
      description: 'One factual sentence describing what the photo shows, at most 25 words.',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      minItems: MIN_TAGS,
      maxItems: MAX_TAGS,
      description: 'Lower-case keywords: objects, activities, places, people groups.',
    },
  },
  required: ['caption', 'tags'],
};

const VISION_PROMPT = [
  'You are cataloguing field evidence for an NGO impact report.',
  `Describe this photo factually and list ${MIN_TAGS}-${MAX_TAGS} tags.`,
  'Describe only what is visible. Do not guess names, places, dates or outcomes.',
  'Use plain words a funder would search for (e.g. "water pump", "classroom", "women", "solar panel").',
].join(' ');

const reportDraftSchema = z.object({
  summary: z.string().max(2000),
  sections: z
    .array(
      z.object({
        heading: z.string().max(200),
        claims: z
          .array(
            z.object({ sentence: z.string().max(800), asset_ids: z.array(z.string()).max(40) }),
          )
          .max(30),
      }),
    )
    .max(12),
});

/** The brief's report shape, as plain JSON Schema for Gemini's structured output. */
const reportJsonSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: '2-3 sentences restating the most important cited findings. Nothing new.',
    },
    sections: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string', description: 'A short plain heading.' },
          claims: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: {
              type: 'object',
              properties: {
                sentence: { type: 'string', description: 'One factual sentence.' },
                asset_ids: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 1,
                  description: 'Ids of the assets in the facts that show this sentence is true.',
                },
              },
              required: ['sentence', 'asset_ids'],
            },
          },
        },
        required: ['heading', 'claims'],
      },
    },
  },
  required: ['summary', 'sections'],
};

export const REPORT_INSTRUCTIONS = [
  'You write impact reports for NGOs, CSR teams and funders from verified field evidence.',
  'Use ONLY the facts in the JSON you are given. Do not add numbers, names, places, dates,',
  'beneficiary counts or outcomes that are not in the facts, and do not speculate.',
  'Write each claim as one sentence and cite, in asset_ids, the ids of the assets from the',
  'facts that show it. Never write a sentence that no listed asset supports.',
  'Counts must match the facts exactly.',
  'Describe how the work is aligned to the listed SDG goals and CSR category using the words',
  '"aligned to". Never claim legal, regulatory or statutory compliance.',
  'Write plain, factual English for a funder, without marketing language.',
  'Use 2-5 sections with short headings, such as "Access to water" or "Progress over time".',
  'Where before/after pairs exist, describe the change and cite both photos.',
].join(' ');

export class GeminiAiClient implements AiClient {
  private readonly ai: GoogleGenAI;

  constructor(
    private readonly env: Pick<
      Env,
      'GEMINI_API_KEY' | 'GEMINI_VISION_MODEL' | 'GEMINI_EMBEDDING_MODEL' | 'GEMINI_REPORT_MODEL'
    >,
  ) {
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async describeImage(imageUrl: string): Promise<VisionResult> {
    const image = await fetch(imageUrl);
    if (!image.ok) throw new Error(`Could not fetch image for captioning (${image.status})`);
    const mimeType = image.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
    const data = Buffer.from(await image.arrayBuffer()).toString('base64');

    const res = await this.ai.models.generateContent({
      model: this.env.GEMINI_VISION_MODEL,
      contents: [
        { role: 'user', parts: [{ inlineData: { mimeType, data } }, { text: VISION_PROMPT }] },
      ],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: visionJsonSchema,
        temperature: 0.2,
      },
    });
    const parsed = visionSchema.parse(JSON.parse(res.text ?? ''));
    return { caption: parsed.caption, tags: [...new Set(parsed.tags)].slice(0, MAX_TAGS) };
  }

  async embed(text: string): Promise<number[]> {
    const res = await this.ai.models.embedContent({
      model: this.env.GEMINI_EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });
    const values = res.embeddings?.[0]?.values;
    if (!values || values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding had ${values?.length ?? 0} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
      );
    }
    return values;
  }

  async generateReport(facts: ReportFacts): Promise<ReportDraft> {
    const res = await this.ai.models.generateContent({
      model: this.env.GEMINI_REPORT_MODEL,
      contents: [
        { role: 'user', parts: [{ text: `Project facts (JSON):\n${JSON.stringify(facts)}` }] },
      ],
      config: {
        systemInstruction: REPORT_INSTRUCTIONS,
        responseMimeType: 'application/json',
        responseJsonSchema: reportJsonSchema,
        temperature: 0.2,
      },
    });
    return reportDraftSchema.parse(JSON.parse(res.text ?? ''));
  }
}
