/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * The team's **presentation field** (#8 follow-up): the one custom field that
 * says who a row is, alongside the name — a jersey number, a membership
 * number. It is drawn *before* the name in the roster and it takes the place
 * of the initials in the circle on a phone.
 *
 * At most one per team, and the database is what says so: a partial unique
 * index on `team_id`, so two clients cannot each set their own and leave the
 * roster with two answers to "which number is this". The handler clears the
 * previous one in the same transaction; this index is what makes that a rule
 * rather than a habit.
 *
 * Default false: no team has one until it says so.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("member_field_definitions")
    .addColumn("presentation", "boolean", (col) =>
      col.notNull().defaultTo(sql`false`)
    )
    .execute();

  await sql`
    create unique index member_field_definitions_presentation_idx
      on member_field_definitions (team_id)
      where presentation
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    drop index if exists member_field_definitions_presentation_idx
  `.execute(db);
  await db.schema
    .alterTable("member_field_definitions")
    .dropColumn("presentation")
    .execute();
}
