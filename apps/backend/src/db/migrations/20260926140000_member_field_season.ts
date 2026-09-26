/** Migration — see ADR-006 for why schema changes only happen here. */
import type { Kysely } from "kysely";

/**
 * A custom field can belong to a **season**: "Tröjnummer 2026", "Storlek
 * träningsställ HT". Once the season's last day is behind the team, the roster
 * stops offering the field as a column — the question it asked is answered.
 *
 * Nullable, because most fields are not about a season at all. Deleting the
 * season sets it back to null rather than taking the field (and its values)
 * with it: losing the period is not the same as losing what was recorded.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("member_field_definitions")
    .addColumn("season_id", "uuid", (col) =>
      col.references("seasons.id").onDelete("set null")
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("member_field_definitions")
    .dropColumn("season_id")
    .execute();
}
