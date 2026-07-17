import type { IncomingMessage } from "node:http";
import { parseCookies } from "./auth/cookies.js";
import {
  SESSION_COOKIE,
  getUserBySessionToken,
  type AuthUser,
} from "./auth/session.js";
import { getDb } from "./db/client.js";

/**
 * oRPC request context — available to every procedure handler.
 * `user` is resolved from the session cookie (null when signed out).
 */
export interface AppContext {
  user: AuthUser | null;
}

export async function resolveContext(
  req: IncomingMessage
): Promise<AppContext> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return { user: null };
  try {
    return { user: await getUserBySessionToken(getDb(), token) };
  } catch (error) {
    // A database hiccup must not turn every request into a 500 — treat the
    // caller as signed out and let procedures decide what requires auth.
    console.error("[backend] Failed to resolve session:", error);
    return { user: null };
  }
}
