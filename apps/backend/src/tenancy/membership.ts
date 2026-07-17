import { ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";

// ---------------------------------------------------------------------------
// Tenant scoping (ADR-003)
//
// Every domain procedure resolves the caller's membership before touching
// tenant data — the club/team context comes from the membership row, never
// from client-supplied ids alone. Procedures added by later issues call
// requireMembership (and, once #5 lands, a permission check on top of it).
// ---------------------------------------------------------------------------

export interface Membership {
  id: string;
  userId: string;
  clubId: string;
  teamId: string | null;
  role: string;
}

/**
 * Returns the caller's membership in the club, or throws FORBIDDEN.
 * Non-members must not be able to distinguish "club exists" from "no access".
 */
export async function requireMembership(
  db: Kysely<Database>,
  userId: string,
  clubId: string
): Promise<Membership> {
  const row = await db
    .selectFrom("memberships")
    .select(["id", "user_id", "club_id", "team_id", "role"])
    .where("user_id", "=", userId)
    .where("club_id", "=", clubId)
    .executeTakeFirst();

  if (!row) {
    throw new ORPCError("FORBIDDEN", {
      message: "Not a member of this club",
    });
  }

  return {
    id: row.id,
    userId: row.user_id,
    clubId: row.club_id,
    teamId: row.team_id,
    role: row.role,
  };
}

/**
 * Returns the team if the caller's membership grants access to it, otherwise
 * throws FORBIDDEN. The tenant check goes through the team's own club_id —
 * never a client-supplied club id. A club-wide membership (team_id null)
 * covers every team in the club; a team-scoped membership covers only its
 * own team.
 */
export async function requireTeamAccess(
  db: Kysely<Database>,
  userId: string,
  teamId: string
): Promise<{ teamId: string; clubId: string; membership: Membership }> {
  const team = await db
    .selectFrom("teams")
    .select(["id", "club_id"])
    .where("id", "=", teamId)
    .executeTakeFirst();

  if (!team) {
    throw new ORPCError("FORBIDDEN", { message: "No access to this team" });
  }

  const membership = await requireMembership(db, userId, team.club_id);

  if (membership.teamId !== null && membership.teamId !== team.id) {
    throw new ORPCError("FORBIDDEN", { message: "No access to this team" });
  }

  return { teamId: team.id, clubId: team.club_id, membership };
}
