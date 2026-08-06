/**
 * What other systems call a person (#89).
 *
 * Deliberately *not* behind ADR-022's gate, unlike `personal-id.ts`. An
 * external id identifies nobody outside the system that issued it: it is a
 * row number in someone else's database, not a fact about a human. Matching
 * on it has to be cheap, and hiding it would buy no privacy.
 *
 * A person may hold several. That is the point — a club may import from more
 * than one system, and one system may know somebody by more than one number.
 */
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";

/** SportAdmin's internal member id, as the närvaro page carries it (#84). */
export const SOURCE_SPORTADMIN = "sportadmin";

/** The club's own membership number, from the member export's `Medlems Nr`. */
export const SOURCE_SPORTADMIN_MEMBER_NO = "sportadmin-medlemsnr";

/**
 * External id → the member of this team who is that person.
 *
 * Team-scoped on purpose: the id names a person club-wide, but an import
 * writes to one team's roster, and a person who plays in P14 and P17 must not
 * have their P14 row updated by a P17 import (ADR-023).
 */
export async function loadMemberExternalIds(
  db: Kysely<Database>,
  params: { teamId: string; clubId: string; source: string }
): Promise<Map<string, string>> {
  const rows = await db
    .selectFrom("person_external_ids")
    .innerJoin("members", "members.person_id", "person_external_ids.person_id")
    .select(["person_external_ids.external_id", "members.id as member_id"])
    .where("person_external_ids.club_id", "=", params.clubId)
    .where("person_external_ids.source", "=", params.source)
    .where("members.team_id", "=", params.teamId)
    .execute();

  // An id held by two members cannot say which one it means. Dropping it
  // sends those rows back to matching by name, which is honest; keeping the
  // last one seen would be a silent wrong match, which is not.
  const byId = new Map<string, string | null>();
  for (const row of rows) {
    byId.set(row.external_id, byId.has(row.external_id) ? null : row.member_id);
  }
  return new Map(
    [...byId].filter((entry): entry is [string, string] => entry[1] !== null)
  );
}

/**
 * Remembers that this member is, in `source`, `externalId`.
 *
 * Called after a match made some other way — by name, the first time — so the
 * next import of the same team is exact and the one after that cannot
 * duplicate anybody. A member with no person yet gets one: since #89 a person
 * is an anchor rather than a personnummer, so someone with no Swedish number
 * can still be a person the club knows.
 *
 * Re-running an import must not accumulate rows. A person has one connection
 * per system, so this writes at most one row per `(person, source)` and
 * overwrites the id when it has changed.
 */
export async function recordMemberExternalId(
  trx: Kysely<Database>,
  params: {
    memberId: string;
    clubId: string;
    source: string;
    externalId: string;
  }
): Promise<void> {
  const { memberId, clubId, source, externalId } = params;

  const member = await trx
    .selectFrom("members")
    .select("person_id")
    .where("id", "=", memberId)
    .executeTakeFirst();
  if (!member) return;

  let personId = member.person_id;
  if (personId === null) {
    const person = await trx
      .insertInto("persons")
      .values({ club_id: clubId })
      .returning("id")
      .executeTakeFirstOrThrow();
    personId = person.id;
    await trx
      .updateTable("members")
      .set({ person_id: personId })
      .where("id", "=", memberId)
      .execute();
  }

  await trx
    .insertInto("person_external_ids")
    .values({
      person_id: personId,
      club_id: clubId,
      source,
      external_id: externalId,
    })
    .onConflict((oc) =>
      oc
        .columns(["person_id", "source"])
        .doUpdateSet({ external_id: externalId })
    )
    .execute();
}
