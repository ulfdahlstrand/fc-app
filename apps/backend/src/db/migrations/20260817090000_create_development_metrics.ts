/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * Player development (#96, ADR-005) — the configurable measurements a team
 * follows over a season: "Nivå" on a 1–5 scale, "30 m sprint" in seconds,
 * "Klarar inkast" as a yes/no.
 *
 * Shaped like tracking lists (#19) at the definition end and unlike them at the
 * value end. A tracking entry is one current answer per member, overwritten in
 * place; the whole point here is the series, so values hang off a dated
 * **assessment** — a coach sits down with one player on one day and fills in
 * everything at once, which is also how it is written (one request, ADR-019).
 *
 * Values are split across two columns rather than stored as text like tracking
 * does. Tracking never compares its values; these are compared constantly, and
 * as text "10" sorts below "9" — a chart that orders wrongly is worse than no
 * chart. `metricValueColumn` in the contract is the single place that decides
 * which column a type lands in, and the CHECK below is the database agreeing.
 *
 * Metrics are archived, never hard-deleted, so a season of measurements
 * survives the metric being retired.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("development_metrics")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("team_id", "uuid", (col) =>
      col.notNull().references("teams.id").onDelete("cascade")
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("value_type", "text", (col) => col.notNull())
    // Display-only suffix for a `number` metric; null for every other type.
    .addColumn("unit", "text")
    // Inclusive bounds of a `scale`. Immutable once set: narrowing 1–10 to 1–5
    // would leave stored 8s outside their own metric.
    .addColumn("scale_min", "integer")
    .addColumn("scale_max", "integer")
    // A sprint time falls when a player improves, so progress cannot be read
    // off the sign of the change alone.
    .addColumn("higher_is_better", "boolean", (col) =>
      col.notNull().defaultTo(true)
    )
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("archived", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("development_metrics_team_id_idx")
    .on("development_metrics")
    .column("team_id")
    .execute();

  // Two live metrics cannot share a name, but a retired one never blocks
  // reusing its own. Un-archiving re-checks it (ADR-014).
  await db.schema
    .createIndex("development_metrics_team_id_name_key")
    .on("development_metrics")
    .columns(["team_id", "name"])
    .unique()
    .where(sql.ref("archived"), "=", false)
    .execute();

  await db.schema
    .createTable("development_assessments")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("member_id", "uuid", (col) =>
      col.notNull().references("members.id").onDelete("cascade")
    )
    // A DATE, not an instant: an assessment belongs to a day the way a season
    // starts on one (see `seasons.starts_on`).
    .addColumn("assessed_on", "date", (col) => col.notNull())
    .addColumn("note", "text")
    // Who recorded it, kept even if the account is later removed — the record
    // of "a coach judged this" outlives the coach.
    .addColumn("created_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null")
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    // Nobody assesses the same player twice on one day — doing it again is
    // editing. This is also what makes saving idempotent under a double submit.
    .addUniqueConstraint("development_assessments_member_day_key", [
      "member_id",
      "assessed_on",
    ])
    .execute();

  await db.schema
    .createIndex("development_assessments_member_id_idx")
    .on("development_assessments")
    .column("member_id")
    .execute();

  await db.schema
    .createTable("development_values")
    .addColumn("assessment_id", "uuid", (col) =>
      col.notNull().references("development_assessments.id").onDelete("cascade")
    )
    .addColumn("metric_id", "uuid", (col) =>
      col.notNull().references("development_metrics.id").onDelete("cascade")
    )
    .addColumn("value_number", "numeric")
    .addColumn("value_text", "text")
    .addPrimaryKeyConstraint("development_values_pk", [
      "assessment_id",
      "metric_id",
    ])
    // Exactly one column carries the value. A handler bug that writes both, or
    // neither, should stop here rather than reach a chart.
    .addCheckConstraint(
      "development_values_one_value",
      sql`num_nonnulls(value_number, value_text) = 1`
    )
    .execute();

  // The member page reads by assessment; a future team-wide view of one metric
  // over a season reads by metric.
  await db.schema
    .createIndex("development_values_metric_id_idx")
    .on("development_values")
    .column("metric_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("development_values").execute();
  await db.schema.dropTable("development_assessments").execute();
  await db.schema.dropTable("development_metrics").execute();
}
