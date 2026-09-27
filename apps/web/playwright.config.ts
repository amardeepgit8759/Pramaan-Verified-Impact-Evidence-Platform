import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Two ways to run e2e:
 *  - `BASE_URL=https://… pnpm e2e` tests a deployed app, end to end, with real services.
 *  - `pnpm e2e` (after `pnpm build`) starts the production web build behind the real API
 *    on the docker-compose test database, with Cloudinary and Gemini swapped for test
 *    doubles (apps/api/test/e2e), so it runs without credentials, including in CI.
 */
const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (fs.existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const deployed = process.env.BASE_URL;
const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = deployed ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: deployed
    ? undefined
    : {
        command: 'pnpm exec tsx test/e2e/server.ts',
        cwd: '../api',
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 90_000,
        env: {
          NODE_ENV: 'production',
          LOG_LEVEL: 'warn',
          PORT: String(port),
          WEB_DIST_DIR: '../web/dist',
          DATABASE_URL:
            process.env.TEST_DATABASE_URL ??
            'postgres://pramaan:pramaan@localhost:55433/pramaan_test',
        },
      },
});
