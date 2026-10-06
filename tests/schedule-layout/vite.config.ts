import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

/**
 * Serves the layout-test harness. Rooted at the repository so the project's
 * real postcss.config.js and tailwind.config.ts apply — the styling under test
 * is the production styling, not a hand-rolled approximation.
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
    entries: ['tests/schedule-layout/index.html', 'tests/schedule-layout/quick-actions.html', 'tests/schedule-layout/master-grid.html', 'tests/schedule-layout/lesson-edit.html', 'tests/schedule-layout/searchable-select.html'],
    include: ['react', 'react-dom', 'react-dom/client', '@tanstack/react-query', '@dnd-kit/core'],
  },
  // SCHEDULE_TEST_PORT lets this suite run from a second checkout at the same
  // time. It is required by THIS feature's test architecture: a searchable
  // selector is verified by driving the harness server, and with a fixed port
  // a concurrent run silently reuses the other checkout's server — so the
  // selectors under test would be the other checkout's, and the suite would
  // pass or fail against source that is not on this branch.
  server: { port: Number(process.env.SCHEDULE_TEST_PORT ?? 5310), strictPort: true },
});
