/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/** Seasons (issue #13) — the period a team's work is measured in: "Autumn 2026", "Season 2026/27". */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("seasons")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("team_id", "uuid", (col) =>
      col.notNull().references("teams.id").onDelete("cascade")
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("starts_on", "date", (col) => col.notNull())
    .addColumn("ends_on", "date", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("seasons_team_id_starts_on_idx")
    .on("seasons")
    .columns(["team_id", "starts_on"])
    .execute();

  // Seasons may overlap (a cup season inside a league season), but two with
  // the same name in one team would be indistinguishable in a dropdown.
  await db.schema
    .createIndex("seasons_team_id_name_key")
    .on("seasons")
    .columns(["team_id", "name"])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("seasons").execute();
}
