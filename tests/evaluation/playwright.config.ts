import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// package.json sets "type": "module", so __dirname is not defined here.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

/** See vite.config.ts in this directory for why the port is overridable. */
const PORT = Number(process.env.EVALUATION_TEST_PORT ?? 5320);

export default defineConfig({
  testDir: here,
  testMatch: '*.spec.ts',
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx vite --config tests/evaluation/vite.config.ts --port ${PORT}`,
    cwd: repoRoot,
    port: PORT,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
