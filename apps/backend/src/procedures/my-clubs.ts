/** The caller's clubs and teams, with the permissions each membership grants. */
import type { Kysely } from "kysely";
import type { MyClub, Permission } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { getClubMemberships } from "../tenancy/membership.js";

/**
 * Lists the clubs the user is a member of, with the teams their memberships
 * grant access to and the effective role + permissions per team (the
 * team-scoped row wins over the club-wide one — mirrors requireTeamAccess).
 * A user can hold several team-scoped memberships in the same club. Drives
 * the frontend's onboarding redirect, club/team switcher, and UI gating.
 */
export async function listMyClubs(
  db: Kysely<Database>,
  userId: string
): Promise<MyClub[]> {
  const clubIds = await db
    .selectFrom("memberships")
    .select("club_id")
    .distinct()
    .where("user_id", "=", userId)
    .execute();

  if (clubIds.length === 0) return [];

  const clubs = await db
    .selectFrom("clubs")
    .select(["id", "name"])
    .where(
      "id",
      "in",
      clubIds.map((row) => row.club_id)
    )
    .orderBy("name")
    .execute();

  const teams = await db
    .selectFrom("teams")
    .select(["id", "club_id", "name"])
    .where(
      "club_id",
      "in",
      clubIds.map((row) => row.club_id)
    )
    .orderBy("name")
    .execute();

  const result: MyClub[] = [];
  for (const club of clubs) {
    const memberships = await getClubMemberships(db, userId, club.id);
    const clubWide = memberships.find((m) => m.teamId === null);
    const teamScoped = new Map(
      memberships.filter((m) => m.teamId !== null).map((m) => [m.teamId, m])
    );

    result.push({
      id: club.id,
      name: club.name,
      role: clubWide?.roleName ?? null,
      permissions: clubWide?.permissions ?? [],
      teams: teams
        .filter(
          (team) =>
            team.club_id === club.id &&
            (clubWide !== undefined || teamScoped.has(team.id))
        )
        .map((team) => {
          const effective = teamScoped.get(team.id) ?? clubWide;
          return {
            id: team.id,
            clubId: team.club_id,
            name: team.name,
            role: effective?.roleName ?? "",
            permissions: (effective?.permissions ?? []) as Permission[],
          };
        }),
    });
  }

  return result;
}

export const myClubsHandler = os.myClubs.handler(async ({ context }) => {
  const user = requireUser(context);
  return { clubs: await listMyClubs(getDb(), user.id) };
});
