/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/** Activity types (issue #11, ADR-005): activity types are data, not code. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("activity_types")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("team_id", "uuid", (col) =>
      col.notNull().references("teams.id").onDelete("cascade")
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("colour", "text", (col) => col.notNull().defaultTo("neutral"))
    .addColumn("supports_call_ups", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("archived", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("activity_types_team_id_idx")
    .on("activity_types")
    .column("team_id")
    .execute();

  // A team cannot have two active types with the same name; archived rows are
  // excluded so a name can be reused after its type is retired.
  await db.schema
    .createIndex("activity_types_team_id_name_key")
    .on("activity_types")
    .columns(["team_id", "name"])
    .unique()
    .where(sql.ref("archived"), "=", false)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("activity_types").execute();
}
