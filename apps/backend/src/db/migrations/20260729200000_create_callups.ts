/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/** Call-ups (issue #16) — the matchtrupp. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("callups")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("activity_id", "uuid", (col) =>
      col.notNull().references("activities.id").onDelete("cascade")
    )
    .addColumn("note", "text")
    .addColumn("published", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("callups_activity_id_key")
    .on("callups")
    .column("activity_id")
    .unique()
    .execute();

  await db.schema
    .createTable("callup_invitations")
    .addColumn("callup_id", "uuid", (col) =>
      col.notNull().references("callups.id").onDelete("cascade")
    )
    .addColumn("member_id", "uuid", (col) =>
      col.notNull().references("members.id").onDelete("cascade")
    )
    .addColumn("response", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("responded_at", "timestamptz")
    .addColumn("response_note", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addPrimaryKeyConstraint("callup_invitations_pkey", [
      "callup_id",
      "member_id",
    ])
    .execute();

  // #17 reads "my call-ups" per member across activities.
  await db.schema
    .createIndex("callup_invitations_member_id_idx")
    .on("callup_invitations")
    .column("member_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("callup_invitations").execute();
  await db.schema.dropTable("callups").execute();
}
