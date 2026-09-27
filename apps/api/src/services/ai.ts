import { EMBEDDING_DIMENSIONS } from '@pramaan/shared';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { Env } from '../env.js';

export interface VisionResult {
  caption: string;
  tags: string[];
}

/**
 * The only way the API talks to Gemini. Tests replace it with a fake; the real
 * implementation is below. Model ids come from env, never from code.
 */
export interface AiClient {
  /** Caption and tag a still image (a photo, or a frame from a video). */
  describeImage(imageUrl: string): Promise<VisionResult>;
  /** Text embedding for semantic search, EMBEDDING_DIMENSIONS long. */
  embed(text: string): Promise<number[]>;
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

export class GeminiAiClient implements AiClient {
  private readonly ai: GoogleGenAI;

  constructor(
    private readonly env: Pick<
      Env,
      'GEMINI_API_KEY' | 'GEMINI_VISION_MODEL' | 'GEMINI_EMBEDDING_MODEL'
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
}
