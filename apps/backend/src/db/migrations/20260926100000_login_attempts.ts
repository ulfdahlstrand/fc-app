/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * Sign-in audit (ADR-027): one row per attempt to sign in, whichever way in and
 * however it ended, for a site admin to read.
 *
 * - `email` is what was typed (lowercased), or the Google profile's address;
 *   null when the attempt never got as far as naming one. It is kept even when
 *   no account has it — an unknown address being tried is what an audit is for.
 * - `user_id` is set only when the attempt resolved to an account, and is
 *   cleared rather than cascaded when that account goes: the attempt happened.
 * - Rows are pruned after 90 days (see `auth/login-audit.ts`); an address and
 *   an IP are personal data and there is no reason to keep them longer.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("login_attempts")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("method", "text", (col) =>
      col.notNull().check(sql`method in ('password', 'google', 'email_link')`)
    )
    .addColumn("outcome", "text", (col) =>
      col
        .notNull()
        .check(
          sql`outcome in ('success', 'invalid_credentials', 'invalid_token', 'rate_limited', 'failed')`
        )
    )
    .addColumn("email", "text")
    .addColumn("user_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null")
    )
    .addColumn("ip", "text")
    .addColumn("user_agent", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("login_attempts_created_at_idx")
    .on("login_attempts")
    .column("created_at")
    .execute();

  await db.schema
    .createIndex("login_attempts_email_idx")
    .on("login_attempts")
    .column("email")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("login_attempts").execute();
}
