import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './test/test-db-url.js';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Live tests need real credentials; run them with `pnpm test:live`.
    exclude: ['test/live/**'],
    globalSetup: ['test/global-setup.ts'],
    // Integration tests share one real database, so run files one at a time.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      CLOUDINARY_CLOUD_NAME: 'test-cloud',
      CLOUDINARY_API_KEY: 'test-key',
      CLOUDINARY_API_SECRET: 'test-secret',
      GEMINI_API_KEY: 'test-gemini-key',
      GEMINI_VISION_MODEL: 'test-vision-model',
      GEMINI_REPORT_MODEL: 'test-report-model',
      GEMINI_EMBEDDING_MODEL: 'test-embedding-model',
      AUTH_RATE_LIMIT_MAX: '10000',
    },
  },
});
