/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * Grants the new `development.manage` permission (#96) to every existing club's
 * Admin and Coach roles. New clubs get it from DEFAULT_ROLES; this is only the
 * backfill.
 *
 * Coach is included here, unlike the `members.import` backfill, because Coach
 * holds it in DEFAULT_ROLES — leaving it out would mean an existing club's
 * coaches silently lacked a permission a newly created club's coaches have.
 *
 * Player and Guardian are deliberately left out: reading a coach's assessment
 * of a child is not something this stage hands to the child (ADR-011). A club
 * that wants to share it can grant it — which role holds what is data (ADR-005).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT INTO role_permissions (role_id, permission)
    SELECT id, 'development.manage' FROM roles WHERE system_key IN ('admin', 'coach')
    ON CONFLICT DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM role_permissions WHERE permission = 'development.manage'
  `.execute(db);
}
