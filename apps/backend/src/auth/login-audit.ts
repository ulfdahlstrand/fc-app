/**
 * Sign-in audit (ADR-027): every attempt to sign in leaves a row in
 * `login_attempts`, read by site admins from /admin.
 *
 * Recording must never decide the attempt. A failed insert is logged and
 * swallowed — a sign-in that would have worked still works, and one that would
 * have failed still fails the same way, in the same time.
 */
import type { IncomingMessage } from "node:http";
import { sql, type Kysely } from "kysely";
import type { Database, LoginMethod, LoginOutcome } from "../db/types.js";

/** How long a row is kept. An address and an IP are personal data. */
export const LOGIN_ATTEMPT_RETENTION_DAYS = 90;

/** Longer is a client dressing itself up; the start says who it is. */
const MAX_USER_AGENT_LENGTH = 300;

export interface LoginAttempt {
  method: LoginMethod;
  outcome: LoginOutcome;
  email?: string | null;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * The address the request came from. Behind Render's proxy that is the first
 * X-Forwarded-For entry, which a client can forge — good enough for per-IP
 * rate limits and for an audit to point at, not proof of anything.
 */
export function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(",")[0]
    ?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

/** The request's IP and user agent, as an attempt records them. */
export function requestOrigin(
  req: IncomingMessage
): Pick<LoginAttempt, "ip" | "userAgent"> {
  return {
    ip: clientIp(req),
    userAgent: req.headers["user-agent"]?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
  };
}

export async function recordLoginAttempt(
  db: Kysely<Database>,
  attempt: LoginAttempt
): Promise<void> {
  try {
    await db
      .insertInto("login_attempts")
      .values({
        method: attempt.method,
        outcome: attempt.outcome,
        email: attempt.email?.toLowerCase() ?? null,
        user_id: attempt.userId ?? null,
        ip: attempt.ip ?? null,
        user_agent: attempt.userAgent ?? null,
      })
      .execute();
    // Pruned as rows are added, so the table holds a rolling window without a
    // scheduled job. The created_at index keeps this cheap.
    await db
      .deleteFrom("login_attempts")
      .where(
        "created_at",
        "<",
        sql<Date>`now() - make_interval(days => ${LOGIN_ATTEMPT_RETENTION_DAYS})`
      )
      .execute();
  } catch (error) {
    console.error(
      "[auth] Could not record sign-in attempt:",
      error instanceof Error ? error.message : error
    );
  }
}
