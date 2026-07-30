/** TanStack Query client singleton. */
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: 30 seconds — avoids unnecessary refetches on mount
      staleTime: 30_000,
      // Retry once on failure
      retry: 1,
    },
  },
});
