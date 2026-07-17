import type { Kysely } from "kysely";
import type { Club, Team } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { seedTeamDefaults } from "../tenancy/seed.js";

/**
 * Creates a club with its first team in one transaction, makes the creator
 * an admin member, and runs the team seeding hook. Extracted for direct
 * unit testing with an injected db.
 */
export async function createClub(
  db: Kysely<Database>,
  userId: string,
  clubName: string,
  teamName: string
): Promise<{ club: Club; team: Team }> {
  return db.transaction().execute(async (trx) => {
    const club = await trx
      .insertInto("clubs")
      .values({ name: clubName })
      .returning(["id", "name"])
      .executeTakeFirstOrThrow();

    const team = await trx
      .insertInto("teams")
      .values({ club_id: club.id, name: teamName })
      .returning(["id", "club_id", "name"])
      .executeTakeFirstOrThrow();

    await trx
      .insertInto("memberships")
      .values({
        user_id: userId,
        club_id: club.id,
        team_id: null,
        role: "admin",
      })
      .execute();

    await seedTeamDefaults(trx, team.id);

    return {
      club: { id: club.id, name: club.name },
      team: { id: team.id, clubId: team.club_id, name: team.name },
    };
  });
}

export const createClubHandler = os.createClub.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    return createClub(getDb(), user.id, input.clubName, input.teamName);
  }
);
