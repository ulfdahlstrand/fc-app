/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * Grants the new `members.import` permission (#63) to every existing club's
 * Admin role. New clubs get it from DEFAULT_ROLES, which hands Admin the whole
 * catalog; this is only the backfill.
 *
 * Coach is deliberately left out. A club that wants its head coach to run the
 * import can grant it — which role holds what is data (ADR-005).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT INTO role_permissions (role_id, permission)
    SELECT id, 'members.import' FROM roles WHERE system_key = 'admin'
    ON CONFLICT DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM role_permissions WHERE permission = 'members.import'
  `.execute(db);
}
