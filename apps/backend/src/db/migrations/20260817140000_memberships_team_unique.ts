/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * Brings old databases up to the membership cardinality the code assumes (#98).
 *
 * `20260717080000_create_tenancy_tables` originally made (user_id, club_id)
 * unique, and commit 7a37cd9 widened it to (user_id, club_id, team_id) NULLS
 * NOT DISTINCT — by editing that migration in place. Databases created after
 * that commit have the wide constraint; every database created before it still
 * has the narrow one and never heard about the change. That drift is what
 * ADR-006 exists to prevent, and why this is a migration of its own rather
 * than another edit.
 *
 * Under the narrow constraint a person can hold one membership per club, so
 * "coach of P14, player in P16" cannot be expressed at all, and the coaches
 * section's ON CONFLICT finds no index matching its column list and fails
 * outright.
 *
 * A no-op on databases that are already correct — the state is asked for
 * rather than assumed, because a statement that throws would take the whole
 * migration transaction with it.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_user_club_uq
  `.execute(db);

  const { rows } = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'memberships_user_club_team_uq'
        AND conrelid = 'memberships'::regclass
    ) AS exists
  `.execute(db);

  if (rows[0]?.exists) return;

  // Only ever widens: every row that satisfied the narrow constraint satisfies
  // this one, so there is nothing to reconcile first.
  await sql`
    ALTER TABLE memberships
    ADD CONSTRAINT memberships_user_club_team_uq
    UNIQUE NULLS NOT DISTINCT (user_id, club_id, team_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Deliberately not reinstated: narrowing back would fail on any club where
  // somebody now holds two team-scoped memberships, and re-creating the bug is
  // not a rollback anybody wants.
  await sql`SELECT 1`.execute(db);
}
