import { sql, type Kysely } from "kysely";

/**
 * Call-ups (issue #16) — the matchtrupp.
 *
 * One call-up per activity, hence the unique index on `activity_id`: a squad
 * is the answer to "who is playing this match", and an activity can only have
 * one of those.
 *
 * `published` separates picking the squad from telling it. Selecting fourteen
 * names has to be possible without anyone's phone buzzing on each tap, so a
 * call-up stays a draft until a coach says otherwise.
 *
 * An invitation starts as `pending` — not decided yet, which Kit draws as a
 * dashed ring. #17 lets players and guardians answer for themselves; the
 * columns for their answer exist from the start so that issue adds behaviour
 * rather than a migration.
 */
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
