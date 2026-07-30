/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/** Attendance (issue #14, ADR-005): statuses are team configuration, not code. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("attendance_statuses")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("team_id", "uuid", (col) =>
      col.notNull().references("teams.id").onDelete("cascade")
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("colour", "text", (col) => col.notNull().defaultTo("neutral"))
    .addColumn("counts_as_present", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("archived", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("attendance_statuses_team_id_idx")
    .on("attendance_statuses")
    .column("team_id")
    .execute();

  // A team cannot have two active statuses with the same name; archived rows
  // are excluded so a name can be reused after its status is retired.
  await db.schema
    .createIndex("attendance_statuses_team_id_name_key")
    .on("attendance_statuses")
    .columns(["team_id", "name"])
    .unique()
    .where(sql.ref("archived"), "=", false)
    .execute();

  await db.schema
    .createTable("attendance_records")
    .addColumn("activity_id", "uuid", (col) =>
      col.notNull().references("activities.id").onDelete("cascade")
    )
    .addColumn("member_id", "uuid", (col) =>
      col.notNull().references("members.id").onDelete("cascade")
    )
    // RESTRICT, not cascade: statuses are archived rather than deleted, so a
    // record can always name the status it was given.
    .addColumn("status_id", "uuid", (col) =>
      col.notNull().references("attendance_statuses.id").onDelete("restrict")
    )
    .addColumn("note", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addPrimaryKeyConstraint("attendance_records_pkey", [
      "activity_id",
      "member_id",
    ])
    .execute();

  // Statistics (#15) reads per member across activities.
  await db.schema
    .createIndex("attendance_records_member_id_idx")
    .on("attendance_records")
    .column("member_id")
    .execute();

  // Makes the RESTRICT check on archiving a status an index lookup.
  await db.schema
    .createIndex("attendance_records_status_id_idx")
    .on("attendance_records")
    .column("status_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("attendance_records").execute();
  await db.schema.dropTable("attendance_statuses").execute();
}
