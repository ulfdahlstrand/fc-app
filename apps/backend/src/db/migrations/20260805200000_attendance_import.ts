/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * Groundwork for the attendance import (#84).
 *
 * `activities.external_ref` holds the exporting system's own activity id. It
 * exists because the obvious natural key — team, type and start instant —
 * is not unique in real data: a sampled season has two matches beginning at
 * the same minute, and matching on the instant would silently merge them and
 * lose one day's attendance. The same column is what makes re-running the
 * import write nothing.
 *
 * Also grants `attendance.import` to every existing club's Admin role. New
 * clubs get it from DEFAULT_ROLES, which hands Admin the whole catalog; this
 * is only the backfill. Coach is deliberately left out — which role holds
 * what is data (ADR-005).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("activities")
    .addColumn("external_ref", "text")
    .execute();

  // Unique per team, not globally: two clubs importing from the same system
  // will collide on its ids otherwise (ADR-003 isolates tenants row by row).
  await db.schema
    .createIndex("activities_team_id_external_ref_key")
    .on("activities")
    .columns(["team_id", "external_ref"])
    .unique()
    .where(sql.ref("external_ref"), "is not", null)
    .execute();

  await sql`
    INSERT INTO role_permissions (role_id, permission)
    SELECT id, 'attendance.import' FROM roles WHERE system_key = 'admin'
    ON CONFLICT DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM role_permissions WHERE permission = 'attendance.import'
  `.execute(db);
  await db.schema
    .dropIndex("activities_team_id_external_ref_key")
    .on("activities")
    .execute();
  await db.schema.alterTable("activities").dropColumn("external_ref").execute();
}
