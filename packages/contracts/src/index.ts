/**
 * The shared API contract: Zod schemas per domain, plus the procedure router
 * that ties them together. The backend attaches handlers to it; the frontend
 * infers a typed client from it. See ADR-001.
 *
 * This file only re-exports. `isoInstantSchema` from `common.ts` is deliberately
 * not among them — it is shared between modules, not part of the public surface.
 */
export { queryBooleanSchema } from "./common.js";
export * from "./health.js";
export * from "./auth.js";
export * from "./permissions.js";
export * from "./roles.js";
export * from "./clubs.js";
export * from "./invitations.js";
export * from "./members.js";
export * from "./guardians.js";
export * from "./groups.js";
export * from "./activities.js";
export * from "./seasons.js";
export * from "./attendance.js";
export * from "./callups.js";
export * from "./posts.js";
export * from "./tracking.js";
export * from "./dashboard.js";
export * from "./contract.js";
