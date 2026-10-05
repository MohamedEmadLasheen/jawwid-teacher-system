import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// package.json sets "type": "module", so __dirname is not defined here.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const PORT = 5320;

export default defineConfig({
  testDir: here,
  testMatch: '*.spec.ts',
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    // The real production build, served the way nginx serves it (static files
    // + SPA history fallback). A service worker needs a secure context, and
    // http://localhost qualifies.
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    cwd: repoRoot,
    port: PORT,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      // Placeholder Supabase config: enough for the bundle to boot so the
      // worker and manifest can be inspected. No account is signed in and no
      // assertion here depends on authentication.
      VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'placeholder-anon-key',
    },
  },
});
