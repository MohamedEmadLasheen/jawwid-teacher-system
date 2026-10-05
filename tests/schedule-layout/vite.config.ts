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
    entries: ['tests/schedule-layout/index.html', 'tests/schedule-layout/quick-actions.html', 'tests/schedule-layout/master-grid.html', 'tests/schedule-layout/lesson-edit.html'],
    include: ['react', 'react-dom', 'react-dom/client', '@tanstack/react-query', '@dnd-kit/core'],
  },
  server: { port: 5310, strictPort: true },
});
