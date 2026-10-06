import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// package.json sets "type": "module", so __dirname is not defined here.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

/**
 * The harness port. Overridable because `reuseExistingServer` will happily
 * attach to whatever already holds the port — including another worktree's
 * harness serving different source, which silently tests the wrong code.
 * Set SCHEDULE_TEST_PORT to run two checkouts side by side.
 */
const PORT = Number(process.env.SCHEDULE_TEST_PORT ?? 5310);

export default defineConfig({
  testDir: here,
  testMatch: '*.spec.ts',
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx vite --config tests/schedule-layout/vite.config.ts --port ${PORT}`,
    cwd: repoRoot,
    port: PORT,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
