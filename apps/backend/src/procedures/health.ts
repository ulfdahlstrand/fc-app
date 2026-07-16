import { os } from "../orpc.js";

/**
 * Implements the `health` procedure defined in @fc-app/contracts.
 * Input and output types are fully inferred from the contract's Zod schemas.
 */
export const healthHandler = os.health.handler(async ({ input }) => {
  return {
    status: "ok" as const,
    ...(input.echo !== undefined ? { echo: input.echo } : {}),
  };
});
