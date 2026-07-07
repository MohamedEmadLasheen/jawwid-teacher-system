import { QueryClient } from '@tanstack/react-query';

/**
 * Single React Query client for the app. Only the Scheduling module
 * consumes it today — every other feature still uses the Zustand
 * fetch-everything pattern in App.tsx's DataLoader.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
