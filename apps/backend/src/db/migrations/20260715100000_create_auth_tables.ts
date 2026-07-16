import { sql, type Kysely } from "kysely";

/**
 * Auth foundation (issue #3, ADR-004):
 * - users:      global accounts; email is how identities are linked
 * - identities: one row per OAuth identity (provider + subject), several may
 *               point at the same user (Google today, Apple later)
 * - sessions:   backend-managed sessions; only a SHA-256 hash of the session
 *               token is stored
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("users")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("image_url", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("users_email_idx")
    .on("users")
    .column("email")
    .execute();

  await db.schema
    .createTable("identities")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("subject", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addUniqueConstraint("identities_provider_subject_uq", [
      "provider",
      "subject",
    ])
    .execute();

  await db.schema
    .createTable("sessions")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("token_hash", "text", (col) => col.notNull().unique())
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("sessions").execute();
  await db.schema.dropTable("identities").execute();
  await db.schema.dropIndex("users_email_idx").execute();
  await db.schema.dropTable("users").execute();
}
