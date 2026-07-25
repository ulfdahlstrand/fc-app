/**
 * DEV-ONLY sign-in — bypasses Google OAuth so the app can be clicked through
 * without real credentials.
 *
 * This file is excluded from the production build (see `tsconfig.build.json`,
 * which drops `src/**\/*.dev.ts`) and is only ever loaded at runtime when
 * `ENABLE_DEV_LOGIN=true` and `NODE_ENV !== "production"` — see the gate in
 * `index.ts`. It must never be imported by production code paths.
 *
 * `GET /auth/dev-login?email=&name=` finds-or-creates a user by email, mints a
 * real session (same `createSession` the OAuth callback uses), sets the session
 * cookie, and redirects to the frontend — so everything downstream behaves
 * exactly as a normally signed-in user.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { getDb } from "../db/client.js";
import { serializeCookie } from "./cookies.js";
import { SESSION_COOKIE, createSession } from "./session.js";

const DEFAULT_EMAIL = "dev@fc-app.local";
const DEFAULT_NAME = "Dev User";

function frontendUrl(): string {
  return process.env["FRONTEND_URL"] ?? "http://localhost:4173";
}

export async function handleDevLogin(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://internal");
  const email = url.searchParams.get("email")?.trim() || DEFAULT_EMAIL;
  const name = url.searchParams.get("name")?.trim() || DEFAULT_NAME;

  const db = getDb();
  const existing = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();

  const userId =
    existing?.id ??
    (
      await db
        .insertInto("users")
        .values({ email, name })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;

  const { token, expiresAt } = await createSession(db, userId);

  console.warn(`[auth] DEV login as ${email} — OAuth bypassed`);
  res.writeHead(302, {
    "Set-Cookie": serializeCookie(SESSION_COOKIE, token, { expires: expiresAt }),
    Location: frontendUrl(),
  });
  res.end();
}
