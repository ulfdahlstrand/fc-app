/** Which groups a set of members belong to, in one query (#99). */
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";

/**
 * Loads group ids for a set of members, keyed by member id and **ordered by
 * group name**, so a caller can take the first without knowing the names.
 *
 * Loaded here rather than added to `memberSchema`, because `toMember` has
 * seven call sites and most of them are mutation responses with no use for
 * this: they would each have to run a query they do not need or hand in `[]`,
 * which does not mean "no groups" but "did not ask".
 *
 * Scoped to the team so a group belonging to another team can never appear,
 * even if a `group_members` row somehow crossed the boundary.
 */
export async function loadMemberGroupIds(
  db: Kysely<Database>,
  teamId: string,
  memberIds: string[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (memberIds.length === 0) return result;

  const rows = await db
    .selectFrom("group_members")
    .innerJoin("groups", "groups.id", "group_members.group_id")
    .select(["group_members.member_id", "group_members.group_id"])
    .where("group_members.member_id", "in", memberIds)
    .where("groups.team_id", "=", teamId)
    .orderBy("groups.name")
    .execute();

  for (const row of rows) {
    result.set(row.member_id, [
      ...(result.get(row.member_id) ?? []),
      row.group_id,
    ]);
  }
  return result;
}
