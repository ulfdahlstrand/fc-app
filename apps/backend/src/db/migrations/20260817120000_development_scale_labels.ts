/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * Names for the steps of a scale (#96): 1–5 read as "Extra lätt", "Lätt",
 * "Medel", "Svår", "Extra svår" rather than as bare numbers.
 *
 * A `jsonb` array of names, lowest step first, shaped like
 * `member_field_definitions.options` (#8) so there is one way an array lives in
 * this schema. Empty means the steps are just numbers, which is what every
 * existing scale keeps.
 *
 * The number is still what is stored against an assessment, so a renamed step
 * changes nothing already recorded and the chart is unaffected — which is why
 * these stay editable while the bounds and the value type do not (ADR-014).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("development_metrics")
    .addColumn("scale_labels", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`)
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("development_metrics")
    .dropColumn("scale_labels")
    .execute();
}
