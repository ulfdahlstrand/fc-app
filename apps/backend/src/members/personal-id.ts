/**
 * The only module that reads or writes a personnummer (ADR-022, ADR-023, #89).
 *
 * `grep person_personal_ids` should therefore return this file and nothing
 * else: the point of keeping the number out of `members` is that reading it
 * has to be a deliberate act, not something a `selectAll()` does for you. A
 * member row carries only a `person_id` — a uuid, which says nothing about
 * anybody — and since #89 a `selectAll()` on `persons` says nothing either.
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
    .selectFrom("members")
    .innerJoin(
      "person_personal_ids",
      "person_personal_ids.person_id",
      "members.person_id"
    )
    .select(["members.id as member_id", "person_personal_ids.personal_id"])
    .where("members.id", "in", memberIds)
    .execute();

  const reveal = mayRevealPersonalId(permissions);
  for (const row of rows) {
    result.set(
      row.member_id,
      reveal
        ? formatPersonalId(row.personal_id)
        : maskPersonalId(row.personal_id)
    );
  }
  return result;
}

/** A person in the club's register, as the import needs to see them. */
export interface KnownPerson {
  personId: string;
  personalId: string;
  /** Members of this club who are this person, by team. */
  members: { memberId: string; teamId: string }[];
}

/**
 * The whole club's register, keyed by number — the one unmasked read.
 *
 * The import compares numbers to decide who a row is, and a masked value
 * cannot be compared. It is club-wide because a person is: the same child in
 * P14 and P17 is one entry here, with a member in each team.
 *
 * The values must never reach a response. Matching happens server-side and
 * only ids travel (ADR-022).
 */
export async function loadClubRegister(
  db: Kysely<Database>,
  clubId: string
): Promise<Map<string, KnownPerson>> {
  const rows = await db
    .selectFrom("person_personal_ids")
    .leftJoin("members", "members.person_id", "person_personal_ids.person_id")
    .select([
      "person_personal_ids.person_id",
      "person_personal_ids.personal_id",
      "members.id as member_id",
      "members.team_id",
    ])
    .where("person_personal_ids.club_id", "=", clubId)
    .execute();

  const register = new Map<string, KnownPerson>();
  for (const row of rows) {
    const known = register.get(row.personal_id) ?? {
      personId: row.person_id,
      personalId: row.personal_id,
      members: [],
    };
    if (row.member_id !== null && row.team_id !== null) {
      known.members.push({ memberId: row.member_id, teamId: row.team_id });
    }
    register.set(row.personal_id, known);
  }
  return register;
}

/** What a valid personnummer implies for the member row itself. */
export interface DerivedFromPersonalId {
  birthDate: string;
  birthYear: number;
}

/**
 * Writes, replaces or clears a member's personnummer.
 *
 * Passing null unlinks the member from their person. The person record itself
 * stays: it may be someone's identity in another team, and it is not this
 * member's to delete.
 *
 * Throws BAD_REQUEST on an unparseable number, and CONFLICT when another
 * member of the same *team* already holds it — one person cannot be two
 * players in one squad. Across teams it is expected, and the register is what
 * makes it one person. Neither message contains the number.
 */
export async function setPersonalId(
  db: Kysely<Database>,
  params: {
    memberId: string;
    teamId: string;
    clubId: string;
    raw: string | null;
  }
): Promise<DerivedFromPersonalId | null> {
  const { memberId, teamId, clubId, raw } = params;

  if (raw === null || raw.trim() === "") {
    await db
      .updateTable("members")
      .set({ person_id: null })
      .where("id", "=", memberId)
      .execute();
    return null;
  }

  const parsed = parsePersonalId(raw);
  if (!parsed.ok) {
    throw new ORPCError("BAD_REQUEST", { message: parsed.error });
  }

  const person = await upsertPerson(db, clubId, parsed.value.value);

  const clash = await db
    .selectFrom("members")
    .select("id")
    .where("team_id", "=", teamId)
    .where("person_id", "=", person.id)
    .where("id", "!=", memberId)
    .executeTakeFirst();
  if (clash) {
    throw new ORPCError("CONFLICT", {
      message: "Another member in this team already has that personnummer",
    });
  }

  await db
    .updateTable("members")
    .set({ person_id: person.id })
    .where("id", "=", memberId)
    .execute();

  return {
    birthDate: parsed.value.birthDate,
    birthYear: parsed.value.birthYear,
  };
}

/**
 * The club's person for this number, creating them the first time.
 *
 * Two writes since #89, because the person and their personnummer are two
 * records now — which is what lets a person exist without one at all. Callers
 * are inside a transaction; a person with no number attached would otherwise
 * be the visible half of a failed insert.
 */
export async function upsertPerson(
  db: Kysely<Database>,
  clubId: string,
  personalId: string
): Promise<{ id: string }> {
  const existing = await db
    .selectFrom("person_personal_ids")
    .select("person_id as id")
    .where("club_id", "=", clubId)
    .where("personal_id", "=", personalId)
    .executeTakeFirst();
  if (existing) return existing;

  const person = await db
    .insertInto("persons")
    .values({ club_id: clubId })
    .returning("id")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("person_personal_ids")
    .values({ person_id: person.id, club_id: clubId, personal_id: personalId })
    .execute();

  return person;
}
