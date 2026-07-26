/**
 * Application root component.
 *
 * Mounts the global providers in order:
 *   QueryClientProvider (TanStack Query) → RouterProvider (TanStack Router)
 *
 * Styling is Tailwind + shadcn/ui; global tokens and the base layer live in
 * src/styles/globals.css (imported in main.tsx). No CSS-in-JS theme provider.
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
