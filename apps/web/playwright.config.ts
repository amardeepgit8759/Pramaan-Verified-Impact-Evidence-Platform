import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// E2E runs the production build (`pnpm build`) exactly as deployed: the API serves the
// web app from one origin. Credentials come from the root .env; the database is the
// docker-compose test database so e2e never touches dev data.
const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (fs.existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node dist/index.js',
    cwd: '../api',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      PORT: String(port),
      WEB_DIST_DIR: '../web/dist',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgres://pramaan:pramaan@localhost:55433/pramaan_test',
    },
  },
});
