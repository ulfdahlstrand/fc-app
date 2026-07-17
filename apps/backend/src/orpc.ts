import { ORPCError, implement } from "@orpc/server";
import { contract } from "@fc-app/contracts";
import type { AppContext } from "./context.js";
import type { AuthUser } from "./auth/session.js";

/**
 * Contract implementer bound to the AppContext type. All procedure handlers
 * are built from `os` so they share the same context shape.
 */
export const os = implement(contract).$context<AppContext>();

/** Returns the signed-in user or throws UNAUTHORIZED — for protected procedures. */
export function requireUser(context: AppContext): AuthUser {
  if (!context.user) {
    throw new ORPCError("UNAUTHORIZED", { message: "Sign-in required" });
  }
  return context.user;
}
