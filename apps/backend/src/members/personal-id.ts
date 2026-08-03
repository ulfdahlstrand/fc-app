/**
 * The only module that reads or writes `member_personal_ids` (ADR-022).
 *
 * `grep member_personal_ids` should therefore return this file and nothing
 * else: the point of keeping the number out of `members` is that reading it
 * has to be a deliberate act, not something a `selectAll()` does for you.
 *
 * The permission check and the masking both live here, so a caller cannot leak
 * a full number by forgetting which shape it asked for.
 */
import { ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import {
  formatPersonalId,
  maskPersonalId,
  parsePersonalId,
  type Permission,
} from "@fc-app/contracts";
import type { Database } from "../db/types.js";

/** Holding this permission is what "may see the whole number" means. */
const REVEAL_PERMISSION: Permission = "members.manage";

export function mayRevealPersonalId(permissions: Permission[]): boolean {
  return permissions.includes(REVEAL_PERMISSION);
}

/**
 * Loads personnummer for a set of members, already in the shape the caller is
 * allowed to see: the full number for `members.manage`, otherwise masked.
 * Members without one are simply absent from the map.
 */
export async function loadPersonalIds(
  db: Kysely<Database>,
  memberIds: string[],
  permissions: Permission[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (memberIds.length === 0) return result;

  const rows = await db
    .selectFrom("member_personal_ids")
    .select(["member_id", "personal_id"])
    .where("member_id", "in", memberIds)
    .execute();

  const reveal = mayRevealPersonalId(permissions);
  for (const row of rows) {
    result.set(
      row.member_id,
      reveal ? formatPersonalId(row.personal_id) : maskPersonalId(row.personal_id)
    );
  }
  return result;
}

/**
 * Raw, unmasked numbers for a whole team, keyed by member — the one read that
 * is not for a caller's eyes. The import has to compare numbers to decide who
 * a row is, and a masked value cannot be compared.
 *
 * It stays in this module so the table still has exactly one reader. The
 * returned values must never reach a response: matching happens server-side
 * and only the resulting member id travels (ADR-022).
 */
export async function loadPersonalIdsForMatching(
  db: Kysely<Database>,
  teamId: string
): Promise<Map<string, string>> {
  const rows = await db
    .selectFrom("member_personal_ids")
    .select(["member_id", "personal_id"])
    .where("team_id", "=", teamId)
    .execute();
  return new Map(rows.map((row) => [row.member_id, row.personal_id]));
}

/** What a valid personnummer implies for the member row itself. */
export interface DerivedFromPersonalId {
  birthDate: string;
  birthYear: number;
}

/**
 * Writes, replaces or clears a member's personnummer, and returns what the
 * member row should derive from it. Passing null clears the row entirely —
 * erasure is a delete here, not a column set to null.
 *
 * Throws BAD_REQUEST on an unparseable number, and CONFLICT when the team
 * already has that person. Neither message contains the number.
 */
export async function setPersonalId(
  db: Kysely<Database>,
  params: { memberId: string; teamId: string; raw: string | null }
): Promise<DerivedFromPersonalId | null> {
  const { memberId, teamId, raw } = params;

  if (raw === null || raw.trim() === "") {
    await db
      .deleteFrom("member_personal_ids")
      .where("member_id", "=", memberId)
      .execute();
    return null;
  }

  const parsed = parsePersonalId(raw);
  if (!parsed.ok) {
    throw new ORPCError("BAD_REQUEST", { message: parsed.error });
  }

  const clash = await db
    .selectFrom("member_personal_ids")
    .select("member_id")
    .where("team_id", "=", teamId)
    .where("personal_id", "=", parsed.value.value)
    .where("member_id", "!=", memberId)
    .executeTakeFirst();
  if (clash) {
    throw new ORPCError("CONFLICT", {
      message: "Another member in this team already has that personnummer",
    });
  }

  await db
    .insertInto("member_personal_ids")
    .values({
      member_id: memberId,
      team_id: teamId,
      personal_id: parsed.value.value,
    })
    .onConflict((oc) =>
      oc.column("member_id").doUpdateSet({ personal_id: parsed.value.value })
    )
    .execute();

  return {
    birthDate: parsed.value.birthDate,
    birthYear: parsed.value.birthYear,
  };
}
