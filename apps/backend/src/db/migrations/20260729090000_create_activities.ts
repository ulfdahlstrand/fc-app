import { sql, type Kysely } from "kysely";

/**
 * Activities (issue #12) — the calendar's rows: trainings, matches and every
 * type a team invents (#11).
 *
 * `starts_at`/`ends_at` are timestamptz: a club can tour, and the app must not
 * silently reinterpret 17:30 in another zone. `ends_at` is nullable because
 * open-ended activities are real (a team party has no set finish).
 *
 * `activity_type_id` is RESTRICTed rather than cascaded — types are archived,
 * never deleted, so an activity can always render its type. `cancelled` is a
 * flag, not a deletion: a cancelled training still has to appear (struck
 * through) so nobody turns up at the pitch for it.
 *
 * Recurrence and season association land in #13, attendance in #14 and
 * call-ups in #16; all three hang off this table.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("activities")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("team_id", "uuid", (col) =>
      col.notNull().references("teams.id").onDelete("cascade")
    )
    .addColumn("activity_type_id", "uuid", (col) =>
      col.notNull().references("activity_types.id").onDelete("restrict")
    )
    .addColumn("title", "text")
    .addColumn("starts_at", "timestamptz", (col) => col.notNull())
    .addColumn("ends_at", "timestamptz")
    .addColumn("location", "text")
    .addColumn("notes", "text")
    .addColumn("cancelled", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  // Every read is "this team, this date window", in start order.
  await db.schema
    .createIndex("activities_team_id_starts_at_idx")
    .on("activities")
    .columns(["team_id", "starts_at"])
    .execute();

  // Supports the type filter, and makes the RESTRICT check on archiving a type
  // an index lookup rather than a scan.
  await db.schema
    .createIndex("activities_activity_type_id_idx")
    .on("activities")
    .column("activity_type_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("activities").execute();
}
