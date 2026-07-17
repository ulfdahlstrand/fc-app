import type { Kysely } from "kysely";
import type { MyClub } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";

/**
 * Lists the clubs the user is a member of, with the teams their memberships
 * grant access to and the effective role per team (the team-scoped row wins
 * over the club-wide one — mirrors requireTeamAccess). A user can hold
 * several team-scoped memberships in the same club. Drives the frontend's
 * onboarding redirect and club/team switcher.
 */
export async function listMyClubs(
  db: Kysely<Database>,
  userId: string
): Promise<MyClub[]> {
  const rows = await db
    .selectFrom("memberships")
    .innerJoin("clubs", "clubs.id", "memberships.club_id")
    .select([
      "clubs.id",
      "clubs.name",
      "memberships.role",
      "memberships.team_id",
    ])
    .where("memberships.user_id", "=", userId)
    .orderBy("clubs.name")
    .execute();

  if (rows.length === 0) return [];

  interface ClubAccess {
    id: string;
    name: string;
    clubWideRole: string | null;
    teamRoles: Map<string, string>;
  }

  const clubs = new Map<string, ClubAccess>();
  for (const row of rows) {
    let club = clubs.get(row.id);
    if (!club) {
      club = { id: row.id, name: row.name, clubWideRole: null, teamRoles: new Map() };
      clubs.set(row.id, club);
    }
    if (row.team_id === null) {
      club.clubWideRole = row.role;
    } else {
      club.teamRoles.set(row.team_id, row.role);
    }
  }

  const teams = await db
    .selectFrom("teams")
    .select(["id", "club_id", "name"])
    .where("club_id", "in", [...clubs.keys()])
    .orderBy("name")
    .execute();

  return [...clubs.values()].map((club) => ({
    id: club.id,
    name: club.name,
    role: club.clubWideRole,
    teams: teams
      .filter(
        (team) =>
          team.club_id === club.id &&
          (club.clubWideRole !== null || club.teamRoles.has(team.id))
      )
      .map((team) => ({
        id: team.id,
        clubId: team.club_id,
        name: team.name,
        role: club.teamRoles.get(team.id) ?? (club.clubWideRole as string),
      })),
  }));
}

export const myClubsHandler = os.myClubs.handler(async ({ context }) => {
  const user = requireUser(context);
  return { clubs: await listMyClubs(getDb(), user.id) };
});
