/**
 * The sign-in audit (ADR-027), through the real HTTP routes and a real
 * database: every attempt leaves a row saying how it ended, and recording one
 * never changes the answer the caller gets.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { closeTestDb, testDb, truncateAll } from "../test/database.js";
import { handleAuthRequest } from "./http.js";
import {
  LOGIN_ATTEMPT_RETENTION_DAYS,
  recordLoginAttempt,
} from "./login-audit.js";
import { hashPassword } from "./password.js";

const PASSWORD = "ett långt lösenord";

let db: Kysely<Database>;
let server: Server;
let baseUrl: string;

async function createAccount(email: string): Promise<string> {
  const user = await db
    .insertInto("users")
    .values({ email, name: "Konto", image_url: null })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("password_credentials")
    .values({ user_id: user.id, password_hash: await hashPassword(PASSWORD) })
    .execute();
  return user.id;
}

function postLogin(email: string, password: string) {
  return fetch(`${baseUrl}/auth/password/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "audit-test/1.0",
      "X-Forwarded-For": "203.0.113.7, 10.0.0.1",
    },
    body: JSON.stringify({ email, password }),
  });
}

function attempts() {
  return db
    .selectFrom("login_attempts")
    .selectAll()
    .orderBy("created_at")
    .execute();
}

beforeAll(async () => {
  server = createServer((req, res) => {
    handleAuthRequest(req, res)
      .then((handled) => {
        if (!handled) res.writeHead(404).end();
      })
      .catch(() => res.writeHead(500).end());
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  db = await testDb();
  await truncateAll();
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeTestDb();
});

describe("password sign-in", () => {
  it("records a success with the account, the IP and the user agent", async () => {
    const userId = await createAccount("ok@example.test");

    const res = await postLogin("ok@example.test", PASSWORD);

    expect(res.status).toBe(200);
    expect(await attempts()).toEqual([
      expect.objectContaining({
        method: "password",
        outcome: "success",
        email: "ok@example.test",
        user_id: userId,
        ip: "203.0.113.7",
        user_agent: "audit-test/1.0",
      }),
    ]);
  });

  it("records a wrong password without naming the account", async () => {
    await createAccount("wrong@example.test");

    const res = await postLogin("wrong@example.test", "inte lösenordet alls");

    expect(res.status).toBe(401);
    expect(await attempts()).toEqual([
      expect.objectContaining({
        outcome: "invalid_credentials",
        email: "wrong@example.test",
        user_id: null,
      }),
    ]);
  });

  it("records an address nobody has — that is what an audit is for", async () => {
    const res = await postLogin("nobody@example.test", PASSWORD);

    expect(res.status).toBe(401);
    expect(await attempts()).toEqual([
      expect.objectContaining({
        outcome: "invalid_credentials",
        email: "nobody@example.test",
      }),
    ]);
  });

  it("records attempts refused by the rate limit", async () => {
    const email = "hammered@example.test";
    for (let i = 0; i < 10; i++) await postLogin(email, "fel lösenord nr x");

    const res = await postLogin(email, "fel lösenord nr x");

    expect(res.status).toBe(429);
    const rows = await attempts();
    expect(rows).toHaveLength(11);
    expect(rows.at(-1)).toMatchObject({ outcome: "rate_limited", email });
  });
});

describe("email links", () => {
  it("records a used-up or made-up token as invalid", async () => {
    const res = await fetch(`${baseUrl}/auth/password/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Shaped like a real token, so it reaches the lookup rather than the schema.
      body: JSON.stringify({ token: "A".repeat(43) }),
    });

    // Off without mail configured; recorded only where the route runs.
    if (res.status === 404) return;
    expect(res.status).toBe(400);
    expect(await attempts()).toEqual([
      expect.objectContaining({ method: "email_link", outcome: "invalid_token" }),
    ]);
  });
});

describe("recordLoginAttempt", () => {
  it(`prunes rows older than ${LOGIN_ATTEMPT_RETENTION_DAYS} days`, async () => {
    await recordLoginAttempt(db, { method: "google", outcome: "failed" });
    await sql`update login_attempts set created_at = now() - interval '91 days'`.execute(
      db
    );

    await recordLoginAttempt(db, { method: "google", outcome: "success" });

    expect((await attempts()).map((row) => row.outcome)).toEqual(["success"]);
  });

  it("never throws, so a broken audit cannot break sign-in", async () => {
    await expect(
      recordLoginAttempt(db, {
        method: "password",
        // Refused by the table's check constraint.
        outcome: "nonsense" as "failed",
      })
    ).resolves.toBeUndefined();
  });
});
