/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * A match can only be coached if a coach is there, and a coach comes with their
 * child: a match level can require at least N **coach children** — members one
 * of whose guardians coaches the team (ADR-028). Copied onto the call-up like
 * the rest of its criteria. Zero is "no requirement", the default for every
 * level and call-up that existed before.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of ["callup_templates", "callups"]) {
    await db.schema
      .alterTable(table)
      .addColumn("min_coach_children", "integer", (col) =>
        col
          .notNull()
          .defaultTo(0)
          .check(sql`min_coach_children BETWEEN 0 AND 10`)
      )
      .execute();
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ["callups", "callup_templates"]) {
    await db.schema.alterTable(table).dropColumn("min_coach_children").execute();
  }
}
