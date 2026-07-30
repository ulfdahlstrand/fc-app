/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * Tracking lists (issue #19, ADR-005) — the configurable replacement for the
 * spreadsheets a club otherwise keeps on the side: "Grönt kort", "Rabatthäfte
 * hämtat", "Medlemsavgift betald".
 *
 * Shaped like custom member fields (#8) on purpose: a team defines typed
 * definitions and stores one value per member per definition. The difference is
 * what they are *for* — a member field describes a person (position, allergies),
 * a tracking definition records progress on something the club is chasing. That
 * is why entries carry `updated_by` and `updated_at` and field values do not:
 * when a fee is marked paid, who ticked it and when is part of the record.
 *
 * Definitions are archived, never hard-deleted, so entries survive the column
 * being taken off the matrix.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("tracking_definitions")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("team_id", "uuid", (col) =>
      col.notNull().references("teams.id").onDelete("cascade")
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("value_type", "text", (col) => col.notNull())
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("archived", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("tracking_definitions_team_id_idx")
    .on("tracking_definitions")
    .column("team_id")
    .execute();

  await db.schema
    .createIndex("tracking_definitions_team_id_name_key")
    .on("tracking_definitions")
    .columns(["team_id", "name"])
    .unique()
    .where(sql.ref("archived"), "=", false)
    .execute();

  await db.schema
    .createTable("tracking_entries")
    .addColumn("definition_id", "uuid", (col) =>
      col.notNull().references("tracking_definitions.id").onDelete("cascade")
    )
    .addColumn("member_id", "uuid", (col) =>
      col.notNull().references("members.id").onDelete("cascade")
    )
    .addColumn("value", "text", (col) => col.notNull())
    // Who last ticked this, kept even if the account is later removed — the
    // record of "someone signed off on this" outlives the signer.
    .addColumn("updated_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null")
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addPrimaryKeyConstraint("tracking_entries_pk", [
      "definition_id",
      "member_id",
    ])
    .execute();

  // The matrix reads by definition; the member page reads by member.
  await db.schema
    .createIndex("tracking_entries_member_id_idx")
    .on("tracking_entries")
    .column("member_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("tracking_entries").execute();
  await db.schema.dropTable("tracking_definitions").execute();
}
