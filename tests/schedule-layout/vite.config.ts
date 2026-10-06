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
    entries: ['tests/schedule-layout/index.html', 'tests/schedule-layout/quick-actions.html', 'tests/schedule-layout/master-grid.html', 'tests/schedule-layout/lesson-edit.html', 'tests/schedule-layout/searchable-select.html', 'tests/schedule-layout/legend-filters.html', 'tests/schedule-layout/teacher-weekly.html', 'tests/schedule-layout/student-admin.html', 'tests/schedule-layout/schedule-admin.html'],
    include: ['react', 'react-dom', 'react-dom/client', '@tanstack/react-query', '@dnd-kit/core'],
  },
  // SCHEDULE_TEST_PORT lets a second checkout (a git worktree, CI shard) run
  // this suite at the same time. Without it both runs bind 5310 and the
  // second silently reuses the first one's server — which serves the OTHER
  // checkout's source, so the tests pass or fail against the wrong code.
  server: { port: Number(process.env.SCHEDULE_TEST_PORT ?? 5310), strictPort: true },
});
