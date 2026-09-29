import { EMBEDDING_DIMENSIONS } from '@pramaan/shared';
import { describe, expect, it, vi } from 'vitest';
import { GeminiAiClient, isCapacityError, RETRY_ATTEMPTS } from '../src/services/ai.js';

const env = {
  GEMINI_API_KEY: 'test-key',
  GEMINI_VISION_MODEL: 'vision-model',
  GEMINI_REPORT_MODEL: 'report-model',
  GEMINI_EMBEDDING_MODEL: 'embedding-model',
  GEMINI_VISION_FALLBACK_MODELS: ['vision-fallback'],
  GEMINI_REPORT_FALLBACK_MODELS: ['report-busy-too', 'report-fallback'],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const values = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i / EMBEDDING_DIMENSIONS);
// Works whichever embedding endpoint the SDK calls.
const embedding = { embedding: { values }, embeddings: [{ values }] };
const busy = {
  error: {
    code: 503,
    message: 'This model is currently experiencing high demand.',
    status: 'UNAVAILABLE',
  },
};

describe('Gemini client retries', () => {
  it('retries a "503: high demand" answer with the production settings, then succeeds', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(503, busy))
      .mockResolvedValueOnce(json(200, embedding));
    const ai = new GeminiAiClient(env, { fetch });

    await expect(ai.embed('hand pump')).resolves.toHaveLength(EMBEDDING_DIMENSIONS);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0]![0])).toContain('embedding-model');
  }, 20_000);

  it('does not retry a request that can never succeed', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        json(400, { error: { code: 400, message: 'Bad request', status: 'INVALID_ARGUMENT' } }),
      );
    const ai = new GeminiAiClient(env, { fetch });
    await expect(ai.embed('hand pump')).rejects.toThrow(/Bad request/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('Gemini model fallback', () => {
  const draft = { summary: 'Water reached Rampur.', sections: [] };
  const answer = {
    candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(draft) }] } }],
  };

  it('uses the fallback model when the primary is still busy after its retries', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
      String(url).includes('report-fallback') ? json(200, answer) : json(503, busy),
    );
    const warn = vi.fn();
    const ai = new GeminiAiClient(env, { fetch }, { warn });

    await expect(ai.generateReport({} as never)).resolves.toEqual(draft);
    const models = fetch.mock.calls.map(([url]) =>
      String(url).includes('report-fallback') ? 'fallback' : 'primary',
    );
    // Primary, then the first fallback (also busy), then the second answers.
    expect(models.filter((m) => m === 'fallback')).toEqual(['fallback']);
    expect(fetch).toHaveBeenCalledTimes(RETRY_ATTEMPTS * 2 + 1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'report-busy-too', next: 'report-fallback' }),
      expect.stringMatching(/next model/),
    );
  }, 30_000);

  it('does not switch models for errors another model would not fix', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        json(400, { error: { code: 400, message: 'Bad request', status: 'INVALID_ARGUMENT' } }),
      );
    const ai = new GeminiAiClient(env, { fetch });
    await expect(ai.generateReport({} as never)).rejects.toThrow(/Bad request/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('recognises capacity errors', () => {
    for (const status of [408, 429, 500, 503, 504]) expect(isCapacityError({ status })).toBe(true);
    for (const status of [400, 401, 403, 404]) expect(isCapacityError({ status })).toBe(false);
    expect(isCapacityError(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe(true);
    expect(isCapacityError(new Error('schema mismatch'))).toBe(false);
    expect(isCapacityError(null)).toBe(false);
  });
});
