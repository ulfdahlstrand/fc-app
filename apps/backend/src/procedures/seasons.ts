import { ORPCError } from "@orpc/server";
import type { Kysely, Selectable } from "kysely";
import type { Season } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database, SeasonsTable } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

/**
 * Seasons (issue #13) — named date ranges a team's work is measured in.
 *
 * Listing needs `members.view` (the activity list and, later, statistics #15
 * offer a season selector to everyone who can see them); managing them is part
 * of team settings and needs `settings.team`.
 *
 * Deleting a season is safe: nothing points at one. Membership is derived from
 * the activity's start date falling inside the range, so removing a season
 * removes a lens, never data.
 */
function toSeason(row: Selectable<SeasonsTable>): Season {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  };
}

async function loadSeason(
  db: Kysely<Database>,
  teamId: string,
  seasonId: string
): Promise<Selectable<SeasonsTable>> {
  const row = await db
    .selectFrom("seasons")
    .selectAll()
    .where("id", "=", seasonId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Season not found" });
  }
  return row;
}

/**
 * Two seasons may overlap — a cup season inside a league season is ordinary —
 * but two with the same name would be indistinguishable in a dropdown. The
 * unique index enforces it; this turns the violation into a readable message.
 */
async function assertNameAvailable(
  db: Kysely<Database>,
  teamId: string,
  name: string,
  excludeId?: string
): Promise<void> {
  let query = db
    .selectFrom("seasons")
    .select("id")
    .where("team_id", "=", teamId)
    .where("name", "=", name);
  if (excludeId !== undefined) {
    query = query.where("id", "!=", excludeId);
  }
  if (await query.executeTakeFirst()) {
    throw new ORPCError("BAD_REQUEST", {
      message: `There is already a season called ${name}`,
    });
  }
}

/** The contract checks this for creates; updates can change one side only. */
function assertRangeInOrder(startsOn: string, endsOn: string): void {
  if (endsOn < startsOn) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The last date must not precede the first",
    });
  }
}

export const listSeasonsHandler = os.listSeasons.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    // Newest first: the season a coach wants is almost always the current one.
    const rows = await db
      .selectFrom("seasons")
      .selectAll()
      .where("team_id", "=", input.teamId)
      .orderBy("starts_on", "desc")
      .execute();
    return { seasons: rows.map(toSeason) };
  }
);

export const createSeasonHandler = os.createSeason.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    await assertNameAvailable(db, input.teamId, input.name);

    const inserted = await db
      .insertInto("seasons")
      .values({
        team_id: input.teamId,
        name: input.name,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { season: toSeason(inserted) };
  }
);

export const updateSeasonHandler = os.updateSeason.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    const existing = await loadSeason(db, input.teamId, input.seasonId);

    if (input.name !== undefined && input.name !== existing.name) {
      await assertNameAvailable(db, input.teamId, input.name, input.seasonId);
    }

    assertRangeInOrder(
      input.startsOn ?? existing.starts_on,
      input.endsOn ?? existing.ends_on
    );

    const updated = await db
      .updateTable("seasons")
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.startsOn !== undefined && { starts_on: input.startsOn }),
        ...(input.endsOn !== undefined && { ends_on: input.endsOn }),
      })
      .where("id", "=", input.seasonId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { season: toSeason(updated) };
  }
);

export const deleteSeasonHandler = os.deleteSeason.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    await loadSeason(db, input.teamId, input.seasonId);

    await db
      .deleteFrom("seasons")
      .where("id", "=", input.seasonId)
      .where("team_id", "=", input.teamId)
      .execute();
    return { deleted: true as const };
  }
);
