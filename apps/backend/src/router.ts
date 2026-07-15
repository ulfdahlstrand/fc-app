import { implement } from "@orpc/server";
import { contract } from "@fc-app/contracts";
import { healthHandler } from "./procedures/health.js";

/**
 * The oRPC router — implements every procedure defined in the @fc-app/contracts
 * package. Adding a new procedure requires: (1) adding it to the contract, and
 * (2) adding its handler here.
 *
 * Handlers that need the database use getDb() internally at request time (not
 * at module-load time), keeping unit tests that import individual handler
 * files free from DATABASE_URL requirements.
 */
export const router = implement(contract).router({
  health: healthHandler,
});

/** AppRouter type — re-exported for use in tests and future tooling. */
export type AppRouter = typeof router;
