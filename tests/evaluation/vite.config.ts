import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

/**
 * Serves the teacher-evaluation harness. Rooted at the repository so the
 * project's real postcss.config.js and tailwind.config.ts apply — the layout
 * and RTL behaviour under test are the production ones.
 *
 * `@/lib/supabase` is aliased to a recording stub, which is what lets the
 * suite drive the real store action and the real evaluations.service without
 * any possibility of reaching a database.
 */
export default defineConfig({
  root: repoRoot,
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/lib\/supabase$/, replacement: path.resolve(__dirname, 'supabase-stub.ts') },
      { find: '@', replacement: path.resolve(repoRoot, 'src') },
    ],
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    entries: ['tests/evaluation/evaluation.html'],
    include: ['react', 'react-dom', 'react-dom/client', '@tanstack/react-query'],
  },
  // EVALUATION_TEST_PORT lets a second checkout (a git worktree, a CI shard)
  // run this suite concurrently. Without it both runs bind the same port and
  // the second silently reuses the first one's server, testing the wrong
  // source — the same hazard the schedule suite documents.
  server: { port: Number(process.env.EVALUATION_TEST_PORT ?? 5320), strictPort: true },
});
