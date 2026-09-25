/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * Email and password sign-in (ADR-024).
 *
 * - password_credentials: at most one per user, holding only a scrypt hash
 *   with its own salt and parameters (`scrypt$N$r$p$salt$hash`). Never the
 *   password. A separate table rather than a column on `users`, so an account
 *   that signs in with Google has no password row at all instead of a null
 *   that every query has to remember.
 * - email_tokens: single-use tokens sent by email — `signup` proves the
 *   address before an account exists, `reset` proves it before a password is
 *   replaced. Only a SHA-256 hash of the token is stored, like sessions.
 *   A pending signup carries the name and the password *hash* until the link
 *   is used; no user row exists before that, so an unproven address can never
 *   own anything.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("password_credentials")
    .addColumn("user_id", "uuid", (col) =>
      col.primaryKey().references("users.id").onDelete("cascade")
    )
    .addColumn("password_hash", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createTable("email_tokens")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("token_hash", "text", (col) => col.notNull().unique())
    .addColumn("purpose", "text", (col) =>
      col.notNull().check(sql`purpose in ('signup', 'reset')`)
    )
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("user_id", "uuid", (col) =>
      col.references("users.id").onDelete("cascade")
    )
    .addColumn("name", "text")
    .addColumn("password_hash", "text")
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("used_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("email_tokens_email_idx")
    .on("email_tokens")
    .column("email")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("email_tokens").execute();
  await db.schema.dropTable("password_credentials").execute();
}
