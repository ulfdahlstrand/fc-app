import type { Kysely } from "kysely";
import type { MyClub } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";

/**
 * Lists the clubs the user is a member of, with the teams their membership
 * grants access to (all teams for club-wide memberships, only the own team
 * for team-scoped ones — mirrors requireTeamAccess) and the user's role.
 * Drives the frontend's onboarding redirect and club/team switcher.
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

  const teams = await db
    .selectFrom("teams")
    .select(["id", "club_id", "name"])
    .where(
      "club_id",
      "in",
      rows.map((row) => row.id)
    )
    .orderBy("name")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    teams: teams
      .filter(
        (team) =>
          team.club_id === row.id &&
          (row.team_id === null || row.team_id === team.id)
      )
      .map((team) => ({ id: team.id, clubId: team.club_id, name: team.name })),
  }));
}

export const myClubsHandler = os.myClubs.handler(async ({ context }) => {
  const user = requireUser(context);
  return { clubs: await listMyClubs(getDb(), user.id) };
});
