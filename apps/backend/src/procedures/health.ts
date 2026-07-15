import { implement } from "@orpc/server";
import { contract } from "@fc-app/contracts";

/**
 * Implements the `health` procedure defined in @fc-app/contracts.
 * Input and output types are fully inferred from the contract's Zod schemas.
 */
export const healthHandler = implement(contract.health).handler(
  async ({ input }) => {
    return {
      status: "ok" as const,
      ...(input.echo !== undefined ? { echo: input.echo } : {}),
    };
  }
);
