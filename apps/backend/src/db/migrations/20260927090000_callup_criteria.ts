/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * Match levels and the mix a squad is picked by (ADR-028).
 *
 * `callup_templates` is team configuration: "Lätt match" wants 6 Lätt, 2 Medel
 * and 2 Extra lätt, read off one development metric. The slots are jsonb, like
 * `scale_labels`: a short list always read and written whole, validated by the
 * contract, and never queried into.
 *
 * A call-up copies what it was set up with rather than pointing at the
 * template for it — adjusting the mix for one match must not change the level,
 * and changing the level later must not rewrite what past matches asked for.
 * `template_id` stays as the match's level, which rotation counts by, and
 * falls back to null if the template is ever deleted outright.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("callup_templates")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("team_id", "uuid", (col) =>
      col.notNull().references("teams.id").onDelete("cascade")
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("level_metric_id", "uuid", (col) =>
      col.notNull().references("development_metrics.id").onDelete("cascade")
    )
    .addColumn("min_attendance_rate", "integer", (col) =>
      col.check(sql`min_attendance_rate BETWEEN 0 AND 100`)
    )
    .addColumn("attendance_activity_type_id", "uuid", (col) =>
      col.references("activity_types.id").onDelete("set null")
    )
    .addColumn("slots", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`)
    )
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("archived", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("callup_templates_team_id_idx")
    .on("callup_templates")
    .column("team_id")
    .execute();

  await db.schema
    .alterTable("callups")
    .addColumn("template_id", "uuid", (col) =>
      col.references("callup_templates.id").onDelete("set null")
    )
    .addColumn("min_attendance_rate", "integer", (col) =>
      col.check(sql`min_attendance_rate BETWEEN 0 AND 100`)
    )
    // Null, not empty: no criteria chosen is not the same as an empty mix.
    .addColumn("slots", "jsonb")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("callups")
    .dropColumn("slots")
    .dropColumn("min_attendance_rate")
    .dropColumn("template_id")
    .execute();
  await db.schema.dropTable("callup_templates").execute();
}
