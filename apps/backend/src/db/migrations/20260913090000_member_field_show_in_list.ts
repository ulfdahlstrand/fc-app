/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * Where a custom member field is shown (#8 follow-up): every field belongs on
 * the member's own page, but only some belong in the roster's columns — a
 * note about an allergy is not a column, a jersey number is.
 *
 * Default true, because that is what every existing field already does: the
 * roster offered all of them and let each user pick. That per-user pick stays;
 * this is the team-level decision about what is on the menu at all.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("member_field_definitions")
    .addColumn("show_in_list", "boolean", (col) =>
      col.notNull().defaultTo(sql`true`)
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("member_field_definitions")
    .dropColumn("show_in_list")
    .execute();
}
