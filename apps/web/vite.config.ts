import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The API reads PORT from the root .env; read it here too so the proxy follows it.
const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (fs.existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const apiTarget = `http://localhost:${process.env.PORT ?? 8787}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    rolldownOptions: {
      output: {
        // Every icon is tiny and shared by many pages, so without this each became its own
        // request. Everything else splits by page: a page loads only the code it uses.
        codeSplitting: {
          groups: [{ name: 'icons', test: /node_modules[\\/]lucide-react[\\/]/ }],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Same-origin in dev too, so auth cookies and SSE behave exactly as in production.
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    // Route tests render the whole app in jsdom, compiling each lazy page on first use;
    // under a parallel run the first test in a file can take a while.
    testTimeout: 30_000,
  },
});
