/**
 * Email and password sign-in against real Postgres (ADR-024).
 *
 * What these guard is the one rule in `password-flows.ts`: an address is only
 * trusted once a link sent to it has been used. Each "takeover" case below is
 * a way someone could try to get into an account whose address they do not
 * control.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { closeTestDb, testDb, truncateAll } from "../test/database.js";
import {
  login,
  register,
  requestReset,
  resetPassword,
  verifySignup,
} from "./password-flows.js";
import { createSession, getUserBySessionToken } from "./session.js";

const FRONTEND = "https://app.example";
const PASSWORD = "a long enough passphrase";

let db: Kysely<Database>;

beforeEach(async () => {
  db = await testDb();
  await truncateAll();
});

afterAll(closeTestDb);

/** The token a mail's link carries. */
function tokenFrom(text: string): string {
  const match = /#token=([^\s]+)/.exec(text);
  if (!match?.[1]) throw new Error(`no token link in:\n${text}`);
  return decodeURIComponent(match[1]);
}

async function signUp(email: string, password = PASSWORD): Promise<string> {
  const mail = await register(db, { name: "Anna", email, password }, FRONTEND);
  const userId = await verifySignup(db, tokenFrom(mail.text));
  if (!userId) throw new Error("signup did not verify");
  return userId;
}

async function googleUser(email: string): Promise<string> {
  const { id } = await db
    .insertInto("users")
    .values({ email, name: "Google-Anna" })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("identities")
    .values({ user_id: id, provider: "google", subject: `g-${email}` })
    .execute();
  return id;
}

describe("register and verify", () => {
  it("creates no account until the link is used", async () => {
    const mail = await register(
      db,
      { name: "Anna", email: "anna@example.com", password: PASSWORD },
      FRONTEND
    );
    expect(mail.to).toBe("anna@example.com");
    expect(mail.text).toContain(`${FRONTEND}/verify-email#token=`);
    expect(await db.selectFrom("users").selectAll().execute()).toEqual([]);

    const userId = await verifySignup(db, tokenFrom(mail.text));
    const user = await db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", userId!)
      .executeTakeFirstOrThrow();
    expect(user).toMatchObject({ email: "anna@example.com", name: "Anna" });
  });

  it("stores neither the password nor the token in the clear", async () => {
    const mail = await register(
      db,
      { name: "Anna", email: "anna@example.com", password: PASSWORD },
      FRONTEND
    );
    const token = tokenFrom(mail.text);
    await verifySignup(db, token);

    const dump = JSON.stringify([
      await db.selectFrom("email_tokens").selectAll().execute(),
      await db.selectFrom("password_credentials").selectAll().execute(),
    ]);
    expect(dump).not.toContain(PASSWORD);
    expect(dump).not.toContain(token);
  });

  it("uses a link once", async () => {
    const mail = await register(
      db,
      { name: "Anna", email: "anna@example.com", password: PASSWORD },
      FRONTEND
    );
    const token = tokenFrom(mail.text);
    expect(await verifySignup(db, token)).not.toBeNull();
    expect(await verifySignup(db, token)).toBeNull();
  });

  it("refuses an expired link", async () => {
    const mail = await register(
      db,
      { name: "Anna", email: "anna@example.com", password: PASSWORD },
      FRONTEND
    );
    await db
      .updateTable("email_tokens")
      .set({ expires_at: new Date(Date.now() - 1000) })
      .execute();
    expect(await verifySignup(db, tokenFrom(mail.text))).toBeNull();
  });

  it("refuses a made-up token and a reset token used as a signup one", async () => {
    await googleUser("anna@example.com");
    const reset = await requestReset(db, "anna@example.com", FRONTEND);
    expect(await verifySignup(db, "x".repeat(43))).toBeNull();
    expect(await verifySignup(db, tokenFrom(reset!.text))).toBeNull();
  });

  it("tells an existing password account so, and sends no link", async () => {
    await signUp("anna@example.com");
    const mail = await register(
      db,
      { name: "Mallory", email: "anna@example.com", password: "mallorys password" },
      FRONTEND
    );
    expect(mail.subject).toBe("Du har redan ett konto");
    expect(mail.text).not.toContain("#token=");
    expect(await login(db, "anna@example.com", "mallorys password")).toBeNull();
  });

  it("adds the password to a Google account once its owner follows the link", async () => {
    const googleId = await googleUser("Anna@Example.com");
    const userId = await signUp("anna@example.com");
    expect(userId).toBe(googleId);
    expect(await db.selectFrom("users").select("id").execute()).toHaveLength(1);
  });
});

describe("takeover attempts", () => {
  it("an unverified signup for a Google user's address gives no access", async () => {
    await googleUser("anna@example.com");
    // Mallory registers Anna's address but cannot read Anna's inbox.
    await register(
      db,
      { name: "Mallory", email: "anna@example.com", password: "mallorys password" },
      FRONTEND
    );
    expect(await login(db, "anna@example.com", "mallorys password")).toBeNull();
    expect(
      await db.selectFrom("password_credentials").selectAll().execute()
    ).toEqual([]);
  });

  it("a pending signup does not squat the address before its owner arrives", async () => {
    await register(
      db,
      { name: "Mallory", email: "anna@example.com", password: "mallorys password" },
      FRONTEND
    );
    // Anna registers for real and follows her own link; Mallory's is now dead.
    const annaId = await signUp("anna@example.com");
    expect(await login(db, "anna@example.com", PASSWORD)).toBe(annaId);
    expect(await login(db, "anna@example.com", "mallorys password")).toBeNull();
  });
});

describe("login", () => {
  it("signs in with the right password", async () => {
    const userId = await signUp("anna@example.com");
    expect(await login(db, "anna@example.com", PASSWORD)).toBe(userId);
  });

  it("refuses a wrong password, an unknown address and a Google-only account alike", async () => {
    await signUp("anna@example.com");
    await googleUser("bert@example.com");
    expect(await login(db, "anna@example.com", "wrong password!")).toBeNull();
    expect(await login(db, "nobody@example.com", PASSWORD)).toBeNull();
    expect(await login(db, "bert@example.com", PASSWORD)).toBeNull();
  });
});

describe("password reset", () => {
  it("answers nothing for an unknown address", async () => {
    expect(await requestReset(db, "nobody@example.com", FRONTEND)).toBeNull();
    expect(await db.selectFrom("email_tokens").selectAll().execute()).toEqual([]);
  });

  it("sets the new password and signs out every other session", async () => {
    const userId = await signUp("anna@example.com");
    const stolen = await createSession(db, userId);

    const mail = await requestReset(db, "anna@example.com", FRONTEND);
    expect(mail!.text).toContain(`${FRONTEND}/reset-password#token=`);
    expect(
      await resetPassword(db, tokenFrom(mail!.text), "a brand new passphrase")
    ).toBe(userId);

    expect(await getUserBySessionToken(db, stolen.token)).toBeNull();
    expect(await login(db, "anna@example.com", PASSWORD)).toBeNull();
    expect(await login(db, "anna@example.com", "a brand new passphrase")).toBe(
      userId
    );
  });

  it("only the newest link works, and only once", async () => {
    await signUp("anna@example.com");
    const first = await requestReset(db, "anna@example.com", FRONTEND);
    const second = await requestReset(db, "anna@example.com", FRONTEND);
    expect(await resetPassword(db, tokenFrom(first!.text), "new passphrase 1")).toBeNull();
    const token = tokenFrom(second!.text);
    expect(await resetPassword(db, token, "new passphrase 2")).not.toBeNull();
    expect(await resetPassword(db, token, "new passphrase 3")).toBeNull();
  });

  it("gives a Google-only account a password through its own inbox", async () => {
    const userId = await googleUser("bert@example.com");
    const mail = await requestReset(db, "bert@example.com", FRONTEND);
    await resetPassword(db, tokenFrom(mail!.text), "bert's new passphrase");
    expect(await login(db, "bert@example.com", "bert's new passphrase")).toBe(
      userId
    );
  });

  it("refuses a signup token used as a reset one", async () => {
    const mail = await register(
      db,
      { name: "Anna", email: "anna@example.com", password: PASSWORD },
      FRONTEND
    );
    expect(
      await resetPassword(db, tokenFrom(mail.text), "another passphrase")
    ).toBeNull();
  });
});
