/** A season's date range as instants. Boundaries are UTC midnight (ADR-008). */
import { ORPCError } from "@orpc/server";
import { addDays } from "date-fns";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";

/** The half-open instant range a season covers (#13), for narrowing an activity query. */
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
