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

  interface StaticDataRouteOption {
    /**
     * `wide` lifts the desktop shell's 1100px cap for this page, so a page with
     * a section menu can put it at the window's left edge and give the rest of
     * the width to the section. See DDR-011.
     */
    layout?: "wide";
  }
}
