import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// package.json sets "type": "module", so __dirname is not defined here.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

// Keep in step with vite.config.ts — see the note there on SCHEDULE_TEST_PORT.
const PORT = Number(process.env.SCHEDULE_TEST_PORT ?? 5310);

export default defineConfig({
  testDir: here,
  testMatch: '*.spec.ts',
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: 'npx vite --config tests/schedule-layout/vite.config.ts',
    cwd: repoRoot,
    env: { SCHEDULE_TEST_PORT: String(PORT) },
    port: PORT,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
