/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * Custom member fields (issue #8, ADR-005): teams define their own typed
 * member fields (definitions) and store a value per member. Definitions are
 * archived, never hard-deleted, so historical values survive. Values are
 * stored as text and validated/cast against the definition's type at write
 * time (see @fc-app/contracts validateMemberFieldValue).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("member_field_definitions")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("team_id", "uuid", (col) =>
      col.notNull().references("teams.id").onDelete("cascade")
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("field_type", "text", (col) => col.notNull())
    .addColumn("options", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`)
    )
    .addColumn("required", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("archived", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("member_field_definitions_team_id_idx")
    .on("member_field_definitions")
    .column("team_id")
    .execute();

  await db.schema
    .createTable("member_field_values")
    .addColumn("member_id", "uuid", (col) =>
      col.notNull().references("members.id").onDelete("cascade")
    )
    .addColumn("definition_id", "uuid", (col) =>
      col
        .notNull()
        .references("member_field_definitions.id")
        .onDelete("cascade")
    )
    .addColumn("value", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("member_field_values_pk", [
      "member_id",
      "definition_id",
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("member_field_values").execute();
  await db.schema.dropTable("member_field_definitions").execute();
}
