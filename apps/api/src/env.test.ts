import { describe, expect, it } from 'vitest';
import { EnvError, loadEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  CLOUDINARY_CLOUD_NAME: 'cloud',
  CLOUDINARY_API_KEY: 'key',
  CLOUDINARY_API_SECRET: 'secret',
  GEMINI_API_KEY: 'gemini',
  GEMINI_VISION_MODEL: 'vision',
  GEMINI_REPORT_MODEL: 'report',
  GEMINI_EMBEDDING_MODEL: 'embedding',
};

describe('loadEnv', () => {
  it('accepts a complete environment and applies defaults', () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(8787);
    expect(env.TAGGING_PROVIDER).toBe('cloudinary');
    expect(env.TWILIO_ACCOUNT_SID).toBeUndefined();
  });

  it('names every missing variable in one error', () => {
    const { CLOUDINARY_API_KEY: _k, GEMINI_API_KEY: _g, ...partial } = valid;
    try {
      loadEnv(partial);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      const message = (err as EnvError).message;
      expect(message).toContain('CLOUDINARY_API_KEY is required');
      expect(message).toContain('GEMINI_API_KEY is required');
    }
  });

  it('treats blank values as missing', () => {
    expect(() => loadEnv({ ...valid, CLOUDINARY_API_SECRET: '   ' })).toThrow(
      /CLOUDINARY_API_SECRET is required/,
    );
  });

  it('rejects a short JWT secret', () => {
    expect(() => loadEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/at least 32/);
  });

  it('rejects an unknown tagging provider', () => {
    expect(() => loadEnv({ ...valid, TAGGING_PROVIDER: 'magic' })).toThrow(/TAGGING_PROVIDER/);
  });
});
