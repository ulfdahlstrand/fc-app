/**
 * Email and password sign-in (ADR-024): what each step does to the database.
 *
 * The rule every function here keeps: **an address is only trusted once a link
 * sent to it has been used.** The app matches invitations, coaches and contacts
 * to accounts by email, so an account holding an address its owner never
 * proved would inherit whatever that address is owed. Hence signup creates no
 * user until the link is followed, and a password can only be attached to an
 * existing account — a Google one included — through a link sent to it.
 *
 * Nothing here reveals whether an address has an account: `register` and
 * `requestReset` return the mail to send (or none) and their callers answer the
 * same way either way; `login` spends the same time on an unknown address.
 */
import { sql, type Kysely, type Transaction } from "kysely";
import type { Database } from "../db/types.js";
import { alreadyRegisteredMail, resetMail, signupMail } from "./auth-mails.js";
import type { Mail } from "./mailer.js";
import {
  burnVerification,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "./password.js";
import {
  generateSessionToken as generateToken,
  hashSessionToken as hashToken,
} from "./session.js";

export const SIGNUP_TOKEN_TTL_MS = 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

type Db = Kysely<Database>;
type Tx = Transaction<Database>;

/** Links put the token in the fragment: never sent to a server, never in a Referer. */
function link(frontendUrl: string, path: string, token: string): string {
  return `${frontendUrl}${path}#token=${encodeURIComponent(token)}`;
}

/** Old tokens are useless; clear them out whenever new ones are made. */
async function pruneTokens(db: Db): Promise<void> {
  await db
    .deleteFrom("email_tokens")
    .where("expires_at", "<", sql<Date>`now() - interval '1 day'`)
    .execute();
}

/** Serialises account changes for one address within a transaction. */
async function lockEmail(tx: Tx, email: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`account:${email}`}))`.execute(
    tx
  );
}

function findUserByEmail(db: Db | Tx, email: string) {
  return db
    .selectFrom("users")
    .leftJoin(
      "password_credentials",
      "password_credentials.user_id",
      "users.id"
    )
    .select(["users.id", "password_credentials.password_hash"])
    .where((eb) => eb(eb.fn("lower", ["users.email"]), "=", email))
    // An address with a password first, then the oldest account.
    .orderBy(sql`password_credentials.password_hash is null`)
    .orderBy("users.created_at")
    .executeTakeFirst();
}

async function consumeToken(
  tx: Tx,
  purpose: "signup" | "reset",
  token: string
) {
  return tx
    .updateTable("email_tokens")
    .set({ used_at: new Date() })
    .where("token_hash", "=", hashToken(token))
    .where("purpose", "=", purpose)
    .where("used_at", "is", null)
    .where("expires_at", ">", new Date())
    .returning(["email", "user_id", "name", "password_hash"])
    .executeTakeFirst();
}

async function setPassword(
  tx: Tx,
  userId: string,
  passwordHash: string
): Promise<void> {
  await tx
    .insertInto("password_credentials")
    .values({ user_id: userId, password_hash: passwordHash })
    .onConflict((oc) =>
      oc.column("user_id").doUpdateSet({
        password_hash: passwordHash,
        updated_at: new Date(),
      })
    )
    .execute();
}

export interface RegisterInput {
  name: string;
  /** Already lowercased by the contract. */
  email: string;
  password: string;
}

/**
 * Starts a signup. Returns the mail to send: a confirmation link, or — if the
 * address already has a password — a note saying so. Always hashes, so both
 * branches cost the same.
 */
export async function register(
  db: Db,
  input: RegisterInput,
  frontendUrl: string
): Promise<Mail> {
  const passwordHash = await hashPassword(input.password);
  const existing = await findUserByEmail(db, input.email);

  if (existing?.password_hash) {
    return alreadyRegisteredMail(input.email, `${frontendUrl}/login`);
  }

  await pruneTokens(db);
  const token = generateToken();
  await db
    .insertInto("email_tokens")
    .values({
      token_hash: hashToken(token),
      purpose: "signup",
      email: input.email,
      user_id: null,
      name: input.name,
      password_hash: passwordHash,
      expires_at: new Date(Date.now() + SIGNUP_TOKEN_TTL_MS),
    })
    .execute();

  return signupMail(
    input.email,
    input.name,
    link(frontendUrl, "/verify-email", token)
  );
}

/**
 * Follows a signup link: the address is proven, so the account is created —
 * or, if one already exists for it (a Google account), the password is added
 * to that one. Returns the user to sign in, or null for a bad, used or expired
 * token.
 */
export async function verifySignup(
  db: Db,
  token: string
): Promise<string | null> {
  return db.transaction().execute(async (tx) => {
    const row = await consumeToken(tx, "signup", token);
    if (!row?.password_hash || row.name === null) return null;

    await lockEmail(tx, row.email);
    const existing = await findUserByEmail(tx, row.email);
    const userId =
      existing?.id ??
      (
        await tx
          .insertInto("users")
          .values({ email: row.email, name: row.name })
          .returning("id")
          .executeTakeFirstOrThrow()
      ).id;

    await setPassword(tx, userId, row.password_hash);

    // Any other pending signup for this address is now moot.
    await tx
      .updateTable("email_tokens")
      .set({ used_at: new Date() })
      .where("email", "=", row.email)
      .where("purpose", "=", "signup")
      .where("used_at", "is", null)
      .execute();

    return userId;
  });
}

/** Checks a password. Returns the user to sign in, or null. */
export async function login(
  db: Db,
  email: string,
  password: string
): Promise<string | null> {
  const user = await findUserByEmail(db, email);

  if (!user?.password_hash) {
    await burnVerification(password);
    return null;
  }

  if (!(await verifyPassword(password, user.password_hash))) return null;

  if (needsRehash(user.password_hash)) {
    await db
      .updateTable("password_credentials")
      .set({ password_hash: await hashPassword(password), updated_at: new Date() })
      .where("user_id", "=", user.id)
      .execute();
  }

  return user.id;
}

/**
 * Starts a reset. Returns the mail to send, or null when the address has no
 * account — the caller answers identically either way. An account without a
 * password (Google only) may use this to get one; the link proves the address.
 */
export async function requestReset(
  db: Db,
  email: string,
  frontendUrl: string
): Promise<Mail | null> {
  const user = await findUserByEmail(db, email);
  if (!user) return null;

  await pruneTokens(db);
  // Only the newest link works.
  await db
    .updateTable("email_tokens")
    .set({ used_at: new Date() })
    .where("user_id", "=", user.id)
    .where("purpose", "=", "reset")
    .where("used_at", "is", null)
    .execute();

  const token = generateToken();
  await db
    .insertInto("email_tokens")
    .values({
      token_hash: hashToken(token),
      purpose: "reset",
      email,
      user_id: user.id,
      name: null,
      password_hash: null,
      expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    })
    .execute();

  return resetMail(email, link(frontendUrl, "/reset-password", token));
}

/**
 * Follows a reset link: sets the new password and ends **every** session the
 * account has, since a reset is what someone does when they think another
 * person got in. Returns the user to sign in afresh, or null.
 */
export async function resetPassword(
  db: Db,
  token: string,
  password: string
): Promise<string | null> {
  const passwordHash = await hashPassword(password);

  return db.transaction().execute(async (tx) => {
    const row = await consumeToken(tx, "reset", token);
    if (!row?.user_id) return null;

    await setPassword(tx, row.user_id, passwordHash);
    await tx.deleteFrom("sessions").where("user_id", "=", row.user_id).execute();
    return row.user_id;
  });
}
