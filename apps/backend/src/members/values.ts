import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";

/**
 * Loads custom field values for a set of members, grouped by member id
 * (definition id → raw value). Returns an empty map for an empty input so
 * callers can skip the query entirely when there are no members.
 */
export async function loadMemberValues(
  db: Kysely<Database>,
  memberIds: string[]
): Promise<Map<string, Record<string, string>>> {
  const result = new Map<string, Record<string, string>>();
  if (memberIds.length === 0) return result;

  const rows = await db
    .selectFrom("member_field_values")
    .select(["member_id", "definition_id", "value"])
    .where("member_id", "in", memberIds)
    .execute();

  for (const row of rows) {
    const fields = result.get(row.member_id) ?? {};
    fields[row.definition_id] = row.value;
    result.set(row.member_id, fields);
  }
  return result;
}
