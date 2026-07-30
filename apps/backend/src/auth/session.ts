/** Opaque session tokens, stored hashed (ADR-004). */
import { createHash, randomBytes } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";

export const SESSION_COOKIE = "fc_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** The signed-in user as exposed to procedures via the oRPC context. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  db: Kysely<Database>,
  userId: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db
    .insertInto("sessions")
    .values({
      user_id: userId,
      token_hash: hashSessionToken(token),
      expires_at: expiresAt,
    })
    .execute();
  return { token, expiresAt };
}

/** Resolves a raw session token to its user, or null if unknown or expired. */
export async function getUserBySessionToken(
  db: Kysely<Database>,
  token: string
): Promise<AuthUser | null> {
  const row = await db
    .selectFrom("sessions")
    .innerJoin("users", "users.id", "sessions.user_id")
    .select([
      "users.id",
      "users.name",
      "users.email",
      "users.image_url",
      "sessions.expires_at",
    ])
    .where("sessions.token_hash", "=", hashSessionToken(token))
    .executeTakeFirst();

  if (!row) return null;
  if (row.expires_at.getTime() <= Date.now()) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    imageUrl: row.image_url,
  };
}

export async function deleteSessionByToken(
  db: Kysely<Database>,
  token: string
): Promise<void> {
  await db
    .deleteFrom("sessions")
    .where("token_hash", "=", hashSessionToken(token))
    .execute();
}
