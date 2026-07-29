import { sql, type Kysely } from "kysely";

/**
 * Recurring activities (issue #13, ADR-008): a **series template** plus
 * **materialised occurrences**.
 *
 * Each occurrence is an ordinary `activities` row carrying `series_id`. That
 * is what makes attendance (#14) and call-ups (#16) work without knowing
 * recurrence exists, keeps the calendar query a plain date-range scan, and
 * turns "edit this occurrence" into a single-row update. The template is kept
 * so "this and following" has something to write to, and so a series can be
 * extended later.
 *
 * The template stores **local wall time**, not instants: a training is at
 * 18:00 in the club's own timezone on both sides of a DST change. Generating
 * from `start_time` + `time_zone` gets that right; adding 7×24h would drift by
 * an hour every spring.
 *
 * `weekdays` holds ISO weekday numbers (1 = Monday … 7 = Sunday), so a series
 * covers "Tuesdays and Thursdays" without the coach creating two of them.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("activity_series")
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
    .addColumn("location", "text")
    .addColumn("notes", "text")
    .addColumn("weekdays", sql`smallint[]`, (col) => col.notNull())
    .addColumn("start_time", "time", (col) => col.notNull())
    .addColumn("end_time", "time")
    .addColumn("starts_on", "date", (col) => col.notNull())
    .addColumn("until", "date", (col) => col.notNull())
    /** IANA zone the wall times above are expressed in, e.g. Europe/Stockholm. */
    .addColumn("time_zone", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("activity_series_team_id_idx")
    .on("activity_series")
    .column("team_id")
    .execute();

  // An occurrence outlives its template: dropping a series leaves the
  // activities standing (with their attendance and call-ups) as one-offs.
  await db.schema
    .alterTable("activities")
    .addColumn("series_id", "uuid", (col) =>
      col.references("activity_series.id").onDelete("set null")
    )
    .execute();

  // "This and following" reads one series in start order.
  await db.schema
    .createIndex("activities_series_id_starts_at_idx")
    .on("activities")
    .columns(["series_id", "starts_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("activities_series_id_starts_at_idx").execute();
  await db.schema.alterTable("activities").dropColumn("series_id").execute();
  await db.schema.dropTable("activity_series").execute();
}
