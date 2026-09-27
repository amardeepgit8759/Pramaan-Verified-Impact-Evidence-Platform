import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Live tests talk to the real Cloudinary and Gemini with the keys in the root .env.
const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (fs.existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  test: {
    include: ['test/live/**/*.live.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
