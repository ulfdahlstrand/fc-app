import { ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";

// ---------------------------------------------------------------------------
// Tenant scoping (ADR-003)
//
// Every domain procedure resolves the caller's memberships before touching
// tenant data — the club/team context comes from membership rows, never
// from client-supplied ids alone.
//
// Membership cardinality: a user holds either one club-wide row (team_id
// null) and/or several team-scoped rows in the same club (e.g. player in
// Team A, coach in Team B). Access to a team requires the club-wide row or
// that team's own row; for role resolution the team-scoped row wins over
// the club-wide one.
// ---------------------------------------------------------------------------

export interface Membership {
  id: string;
  userId: string;
  clubId: string;
  teamId: string | null;
  role: string;
}

/** All membership rows the user holds in the club (may be empty). */
export async function getClubMemberships(
  db: Kysely<Database>,
  userId: string,
  clubId: string
): Promise<Membership[]> {
  const rows = await db
    .selectFrom("memberships")
    .select(["id", "user_id", "club_id", "team_id", "role"])
    .where("user_id", "=", userId)
    .where("club_id", "=", clubId)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    clubId: row.club_id,
    teamId: row.team_id,
    role: row.role,
  }));
}

/**
 * Returns the caller's memberships in the club, or throws FORBIDDEN.
 * Non-members must not be able to distinguish "club exists" from "no access".
 */
export async function requireMembership(
  db: Kysely<Database>,
  userId: string,
  clubId: string
): Promise<Membership[]> {
  const memberships = await getClubMemberships(db, userId, clubId);
  if (memberships.length === 0) {
    throw new ORPCError("FORBIDDEN", {
      message: "Not a member of this club",
    });
  }
  return memberships;
}

/**
 * Returns the team with the membership that grants access to it, otherwise
 * throws FORBIDDEN. The tenant check goes through the team's own club_id —
 * never a client-supplied club id. The team-scoped membership wins over the
 * club-wide one when both exist, so team-specific roles apply.
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

  const memberships = await requireMembership(db, userId, team.club_id);
  const membership =
    memberships.find((row) => row.teamId === team.id) ??
    memberships.find((row) => row.teamId === null);

  if (!membership) {
    throw new ORPCError("FORBIDDEN", { message: "No access to this team" });
  }

  return { teamId: team.id, clubId: team.club_id, membership };
}
