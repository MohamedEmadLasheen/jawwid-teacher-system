import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// package.json sets "type": "module", so __dirname is not defined here.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

export default defineConfig({
  testDir: here,
  testMatch: '*.spec.ts',
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5310' },
  webServer: {
    command: 'npx vite --config tests/schedule-layout/vite.config.ts',
    cwd: repoRoot,
    port: 5310,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
