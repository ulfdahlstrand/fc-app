import { ORPCError } from "@orpc/server";
import { addDays } from "date-fns";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";

/**
 * The half-open instant range a season covers (#13), for narrowing an
 * activity query. `ends_on` is inclusive, hence "< the day after".
 *
 * The boundaries are read as UTC midnight. Teams do not carry a timezone yet,
 * and a season is months long, so the only thing this can misplace is an
 * activity within a couple of hours of midnight on the very first or last day.
 * Worth revisiting if teams ever gain a zone of their own.
 *
 * Shared by the calendar (#12) and the statistics page (#15) so the two can
 * never disagree about which activities a season contains.
 */
export async function seasonRange(
  db: Kysely<Database>,
  teamId: string,
  seasonId: string
): Promise<{ from: Date; to: Date }> {
  const season = await db
    .selectFrom("seasons")
    .select(["starts_on", "ends_on"])
    .where("id", "=", seasonId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!season) {
    throw new ORPCError("NOT_FOUND", { message: "Season not found" });
  }
  return {
    from: new Date(`${season.starts_on}T00:00:00Z`),
    to: addDays(new Date(`${season.ends_on}T00:00:00Z`), 1),
  };
}
