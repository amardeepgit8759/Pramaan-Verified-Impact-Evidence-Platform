import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/db/migrate-cli.ts'],
  format: 'esm',
  target: 'node22',
  platform: 'node',
  clean: true,
  // The shared package ships TypeScript source, so it must be bundled in.
  noExternal: ['@pramaan/shared'],
});
