/**
 * Accepting invitations, against a real database.
 *
 * This file earned itself immediately. PR #70 "fixed" the ON CONFLICT target
 * here from `(user_id, club_id, team_id)` to `(user_id, club_id)`, on the
 * evidence of a development database whose constraint said so. The migrations
 * say otherwise — `memberships_user_club_team_uq`, NULLS NOT DISTINCT — so the
 * development database had drifted, and the "fix" broke acceptance on every
 * correctly migrated one. This suite caught that within minutes of existing.
 *
 * The type checker cannot see a constraint, and the mocked handler tests
 * cannot either: a mock has no constraints. Only a real database says no.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import {
  createTestClub,
  createTestMember,
  createTestUser,
  type TestClub,
} from "../test/fixtures.js";
import { closeTestDb, testDb, truncateAll } from "../test/database.js";
import { requireTeamAccess } from "../tenancy/membership.js";
import { acceptInvitationHandler } from "./invitations.js";

let db: Kysely<Database>;
let club: TestClub;

beforeEach(async () => {
  db = await testDb();
  await truncateAll();
  club = await createTestClub(db);
});

afterAll(async () => {
  await closeTestDb();
});

async function createGuardianInvitation(params: {
  memberId: string;
  email: string;
  relation: string;
  createdBy: string;
}): Promise<string> {
  const token = randomBytes(16).toString("base64url");
  await db
    .insertInto("invitations")
    .values({
      club_id: club.clubId,
      team_id: club.teamId,
      role_id: club.roleIds["guardian"] ?? club.adminRoleId,
      email: params.email,
      token,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      created_by: params.createdBy,
      member_id: params.memberId,
      relation: params.relation,
    })
    .execute();
  return token;
}

describe("acceptInvitation, member-bound", () => {
  it("is accepted by someone who is already in the club", async () => {
    // The exact shape that used to 500: the accepting user already holds a
    // membership, so the insert hits its conflict path.
    const admin = await createTestUser(db, club, { systemKey: "admin" });
    const memberId = await createTestMember(db, club.teamId, {
      firstName: "Ture",
    });
    const token = await createGuardianInvitation({
      memberId,
      email: admin.email,
      relation: "guardian",
      createdBy: admin.userId,
    });

    const result = await call(
      acceptInvitationHandler,
      { token },
      { context: admin.context }
    );

    expect(result.clubId).toBe(club.clubId);

    const guardians = await db
      .selectFrom("member_guardians")
      .selectAll()
      .where("member_id", "=", memberId)
      .execute();
    expect(guardians).toHaveLength(1);
    expect(guardians[0]?.relation).toBe("guardian");
  });

  // Skipped, not deleted: this is issue #74, a real bug with no one-line fix.
  // The permission model gives one role per user per team, so a coach whose own
  // child plays in the team they coach cannot be both. Written down here so it
  // turns green the day it is fixed rather than being rediscovered.
  it.skip("does not cost a coach their permissions in the team they coach", async () => {
    // A coach accepting a guardian invitation for their own child gets a
    // team-scoped guardian membership alongside their club-wide coach one.
    // requireTeamAccess prefers the team-scoped row, so the question is not
    // how many rows exist but what the coach can still do.
    const coach = await createTestUser(db, club, { systemKey: "coach" });
    const memberId = await createTestMember(db, club.teamId);
    const token = await createGuardianInvitation({
      memberId,
      email: coach.email,
      relation: "guardian",
      createdBy: coach.userId,
    });

    await call(acceptInvitationHandler, { token }, { context: coach.context });

    const access = await requireTeamAccess(db, coach.userId, club.teamId);
    expect(access.membership.permissions).toContain("members.manage");
  });

  it("claims the imported contact that shares the accepting address", async () => {
    const admin = await createTestUser(db, club, { systemKey: "admin" });
    const memberId = await createTestMember(db, club.teamId);
    await db
      .insertInto("member_contacts")
      .values([
        {
          member_id: memberId,
          name: "Rätt Förälder",
          relation: "Mamma",
          // Deliberately a different case: the match must fold it.
          email: admin.email.toUpperCase(),
          phone: null,
          user_id: null,
          linked_member_id: null,
        },
        {
          member_id: memberId,
          name: "Annan Förälder",
          relation: "Pappa",
          email: "someone.else@example.test",
          phone: null,
          user_id: null,
          linked_member_id: null,
        },
      ])
      .execute();

    const token = await createGuardianInvitation({
      memberId,
      email: admin.email,
      relation: "guardian",
      createdBy: admin.userId,
    });
    await call(acceptInvitationHandler, { token }, { context: admin.context });

    const contacts = await db
      .selectFrom("member_contacts")
      .select(["name", "user_id"])
      .where("member_id", "=", memberId)
      .orderBy("name")
      .execute();
    expect(contacts.find((c) => c.name === "Rätt Förälder")?.user_id).toBe(
      admin.userId
    );
    expect(contacts.find((c) => c.name === "Annan Förälder")?.user_id).toBeNull();
  });

  it("sets the member's own address when they accept for themselves", async () => {
    const member = await createTestUser(db, club, { systemKey: "admin" });
    const memberId = await createTestMember(db, club.teamId, {
      email: "a.parent@example.test",
    });
    const token = await createGuardianInvitation({
      memberId,
      email: member.email,
      relation: "self",
      createdBy: member.userId,
    });

    await call(acceptInvitationHandler, { token }, { context: member.context });

    const row = await db
      .selectFrom("members")
      .select("email")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row.email).toBe(member.email);
  });

  it("does not touch the member's address for a guardian acceptance", async () => {
    const guardian = await createTestUser(db, club, { systemKey: "admin" });
    const memberId = await createTestMember(db, club.teamId, {
      email: "a.parent@example.test",
    });
    const token = await createGuardianInvitation({
      memberId,
      email: guardian.email,
      relation: "guardian",
      createdBy: guardian.userId,
    });

    await call(acceptInvitationHandler, { token }, { context: guardian.context });

    const row = await db
      .selectFrom("members")
      .select("email")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row.email).toBe("a.parent@example.test");
  });
});
