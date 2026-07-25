/**
 * Application root component.
 *
 * Mounts the global providers in order:
 *   QueryClientProvider (TanStack Query) → RouterProvider (TanStack Router)
 *
 * Styling is Tailwind v4 + shadcn/ui; design tokens live in styles/globals.css.
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { queryClient } from "./query-client";
import { router } from "./router";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
