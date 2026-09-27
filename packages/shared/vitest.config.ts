import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.ts'],
      // index, domain and health only declare constants and schemas; there's no logic to cover.
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/domain.ts', 'src/health.ts'],
      reporter: ['text-summary', 'text'],
      // The scoring and parsing logic is the product's core promise: keep it fully tested.
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
