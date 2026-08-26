/**
 * Every list of members comes back in one order (#101, ADR-010).
 *
 * This needs a real database because the thing that can break is not the
 * comparator — that has its own unit test — but the *agreement* between it and
 * the SQL that mirrors it. Neither cluster this app runs on is Swedish-collated,
 * so without the explicit `COLLATE "sv-SE-x-icu"` in `memberNameOrder` these
 * queries sort `Ärna` before `Åke` while `compareMemberNames` does the
 * opposite, and two screens showing the same roster disagree. A mock database
 * sorts in JavaScript and would pass no matter what the collation is.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call } from "@orpc/server";
import type { Kysely } from "kysely";
import { compareMemberNames, formatMemberName } from "@fc-app/contracts";
import type { Database } from "../db/types.js";
import { closeTestDb, testDb, truncateAll } from "../test/database.js";
import {
  createTestClub,
  createTestMember,
  createTestUser,
  type TestClub,
  type TestUser,
} from "../test/fixtures.js";
import { listMembersHandler } from "./members.js";
import { listTeamCoachesHandler } from "./coaches.js";
import { myMembersHandler } from "./guardians.js";
import { trackingMatrixHandler } from "./tracking.js";

let db: Kysely<Database>;
let club: TestClub;
let admin: TestUser;

/**
 * Names chosen to fail under the collations this app actually meets: `Åke` and
 * `Ärna` separate Swedish from codepoint order, `bo` separates it from the `C`
 * collation's "all capitals first", and the two Annas force the last-name
 * tie-break to be exercised.
 */
const ROSTER: [string, string][] = [
  ["Örjan", "Ek"],
  ["Anna", "Öberg"],
  ["Åke", "Nyman"],
  ["bo", "Sandell"],
  ["Zeb", "Lund"],
  ["Ärna", "Vik"],
  ["Anna", "Berg"],
  ["Bea", "Holm"],
];

const EXPECTED = [
  "Anna Berg",
  "Anna Öberg",
  "Bea Holm",
  "bo Sandell",
  "Zeb Lund",
  "Åke Nyman",
  "Ärna Vik",
  "Örjan Ek",
];

async function seedRoster(teamId: string): Promise<void> {
  for (const [firstName, lastName] of ROSTER) {
    await createTestMember(db, teamId, { firstName, lastName });
  }
}

beforeEach(async () => {
  db = await testDb();
  await truncateAll();
  club = await createTestClub(db);
  admin = await createTestUser(db, club, { systemKey: "admin" });
  await seedRoster(club.teamId);
});

afterAll(async () => {
  await closeTestDb();
});

describe("the order every member list is in", () => {
  it("gives the roster in reading order, not by surname", async () => {
    const result = await call(
      listMembersHandler,
      { teamId: club.teamId },
      { context: admin.context }
    );

    expect(result.members.map(formatMemberName)).toEqual(EXPECTED);
  });

  it("pins the database's order to compareMemberNames", async () => {
    // The drift test. Sorting the same rows both ways has to produce the same
    // sequence; if the COLLATE clause is dropped, this is what notices.
    const result = await call(
      listMembersHandler,
      { teamId: club.teamId },
      { context: admin.context }
    );

    const fromSql = result.members.map(formatMemberName);
    const fromJs = [...result.members]
      .sort(compareMemberNames)
      .map(formatMemberName);

    expect(fromSql).toEqual(fromJs);
  });

  it("orders the tracking matrix the same way", async () => {
    const result = await call(
      trackingMatrixHandler,
      { teamId: club.teamId },
      { context: admin.context }
    );

    expect(result.members.map(formatMemberName)).toEqual(EXPECTED);
  });

  it("orders the coach candidates the same way", async () => {
    const result = await call(
      listTeamCoachesHandler,
      { teamId: club.teamId },
      { context: admin.context }
    );

    // Candidates who cannot be appointed sort last whatever their name, so
    // compare only the names, in the order the handler put them in.
    expect(result.memberCandidates.map(formatMemberName)).toEqual(EXPECTED);
  });

  it("orders a guardian's linked members the same way", async () => {
    const guardian = await createTestUser(db, club, { systemKey: "player" });
    const members = await db
      .selectFrom("members")
      .select("id")
      .where("team_id", "=", club.teamId)
      .execute();
    for (const member of members) {
      await db
        .insertInto("member_guardians")
        .values({
          member_id: member.id,
          user_id: guardian.userId,
          relation: "guardian",
        })
        .execute();
    }

    const result = await call(
      myMembersHandler,
      {},
      { context: guardian.context }
    );

    expect(result.members.map(formatMemberName)).toEqual(EXPECTED);
  });

  it("still finds a member by either half of the name", async () => {
    // The search shares its query with the ordering, and the display order no
    // longer matches what is searched — so both halves are asserted.
    const byFirst = await call(
      listMembersHandler,
      { teamId: club.teamId, search: "Anna" },
      { context: admin.context }
    );
    expect(byFirst.members.map(formatMemberName)).toEqual([
      "Anna Berg",
      "Anna Öberg",
    ]);

    const byLast = await call(
      listMembersHandler,
      { teamId: club.teamId, search: "Nyman" },
      { context: admin.context }
    );
    expect(byLast.members.map(formatMemberName)).toEqual(["Åke Nyman"]);
  });
});
