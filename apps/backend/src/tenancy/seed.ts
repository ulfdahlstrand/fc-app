import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";

/**
 * Seeds a newly created team with its default configuration (ADR-005).
 *
 * Currently a no-op hook. Later issues extend it:
 * - #5:  default roles (club level)
 * - #11: activity types (Training, Match)
 * - #14: attendance statuses (Present, Absent, Ill)
 */
export async function seedTeamDefaults(
  _db: Kysely<Database>,
  _teamId: string
): Promise<void> {
  // Intentionally empty — see the issue list above.
}
