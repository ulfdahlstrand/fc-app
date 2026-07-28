import { sql, type Kysely } from "kysely";

/**
 * Activity types (issue #11, ADR-005): activity types are data, not code.
 * Every team is seeded with Training and Match and may add its own (cup, team
 * party, parent meeting…).
 *
 * `colour` stores a Kit palette token name — "green", "ink", … — not a hex
 * value. The Kit design system allows three colour families and nothing else,
 * so a free-form colour would let teams design outside the system; storing the
 * token also means the palette can be re-themed without a data migration.
 *
 * `supports_call_ups` is read by #16 to decide which activities get a call-up
 * tab. Types are archived, never hard-deleted, so activities that reference a
 * retired type keep rendering.
 */
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
