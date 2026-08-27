/**
 * The group membership the roster groups itself by (#99).
 *
 * Against a real database because the two claims are about rows and joins:
 * that each member's groups come back **ordered by group name**, so the client
 * can take the first without resolving names, and that the join is scoped to
 * the team, so a group belonging to another team can never appear in a
 * section heading.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { closeTestDb, testDb, truncateAll } from "../test/database.js";
import {
  createTestClub,
  createTestMember,
  createTestTeam,
  createTestUser,
  type TestClub,
  type TestUser,
} from "../test/fixtures.js";
import { listMembersHandler } from "./members.js";

let db: Kysely<Database>;
let club: TestClub;
let admin: TestUser;

async function createGroup(teamId: string, name: string): Promise<string> {
  const group = await db
    .insertInto("groups")
    .values({ team_id: teamId, name })
    .returning("id")
    .executeTakeFirstOrThrow();
  return group.id;
}

async function addToGroup(groupId: string, memberId: string): Promise<void> {
  await db
    .insertInto("group_members")
    .values({ group_id: groupId, member_id: memberId })
    .execute();
}

beforeEach(async () => {
  db = await testDb();
  await truncateAll();
  club = await createTestClub(db);
  admin = await createTestUser(db, club, { systemKey: "admin" });
});

afterAll(async () => {
  await closeTestDb();
});

describe("listMembers groupIds", () => {
  it("orders a member's groups by group name", async () => {
    const memberId = await createTestMember(db, club.teamId, {
      firstName: "Anna",
    });
    // Inserted in the wrong order on purpose — creation order must not leak.
    const born = await createGroup(club.teamId, "Född 2014");
    const squad = await createGroup(club.teamId, "A-truppen");
    await addToGroup(born, memberId);
    await addToGroup(squad, memberId);

    const result = await call(
      listMembersHandler,
      { teamId: club.teamId },
      { context: admin.context }
    );

    expect(result.groupIds[memberId]).toEqual([squad, born]);
  });

  it("leaves a member in no group out of the map entirely", async () => {
    const memberId = await createTestMember(db, club.teamId);

    const result = await call(
      listMembersHandler,
      { teamId: club.teamId },
      { context: admin.context }
    );

    expect(result.groupIds[memberId]).toBeUndefined();
  });

  it("never reports a group belonging to another team", async () => {
    const otherTeamId = await createTestTeam(db, club.clubId, "P16");
    const memberId = await createTestMember(db, club.teamId);
    const foreign = await createGroup(otherTeamId, "A-truppen");
    await addToGroup(foreign, memberId);

    const result = await call(
      listMembersHandler,
      { teamId: club.teamId },
      { context: admin.context }
    );

    expect(result.groupIds[memberId]).toBeUndefined();
  });

  it("covers every member the list returned", async () => {
    const one = await createTestMember(db, club.teamId, { firstName: "Anna" });
    const two = await createTestMember(db, club.teamId, { firstName: "Bea" });
    const squad = await createGroup(club.teamId, "A-truppen");
    await addToGroup(squad, one);
    await addToGroup(squad, two);

    const result = await call(
      listMembersHandler,
      { teamId: club.teamId },
      { context: admin.context }
    );

    expect(result.groupIds).toEqual({ [one]: [squad], [two]: [squad] });
  });
});
