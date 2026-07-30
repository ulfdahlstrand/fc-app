/** TanStack Router instance. */
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./route-tree.gen";

export const router = createRouter({ routeTree });

// Register the router instance for full type safety across the app.
// See: https://tanstack.com/router/latest/docs/framework/react/guide/type-safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
