/**
 * TanStack Query utilities generated from the oRPC client.
 *
 * `orpcQuery.<procedure>` exposes typed helpers straight off the contract:
 *   - `.queryOptions({ input })`  → full query options (typed key + queryFn)
 *   - `.key({ input })`           → a *partial-matching* key for invalidation
 *                                    (input is deep-partial, so `{ input: { teamId } }`
 *                                    matches every query for that team)
 *
 * Deriving keys from the contract means they can't drift from the calls, and
 * there are no hand-written key strings to keep in sync (ADR-007 follow-up).
 */
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { orpc } from "../orpc-client";

export const orpcQuery = createTanstackQueryUtils(orpc);
