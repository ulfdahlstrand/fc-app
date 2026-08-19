/**
 * Coaches of a team, against a real database (#98).
 *
 * What this feature promises is a statement about rows in `memberships`: that
 * the same account can coach two teams (one row each), that removing a coach
 * takes away the team row and never the club-wide one, and that the unique
 * constraint turns "make the player a coach" into a role change rather than a
 * second membership. A mock has none of those constraints.
 *
 * The gate is the other half. Appointing a coach is `settings.club` — a coach
 * cannot appoint coaches, not even in their own team — and a test that never
 * asserts the refusal would leave that claim unchecked.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call, ORPCError } from "@orpc/server";
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
import {
  addCoachByEmailHandler,
  addMemberAsCoachHandler,
  addTeamCoachHandler,
  listTeamCoachesHandler,
  removeTeamCoachHandler,
} from "./coaches.js";
import { signInWithProfile } from "../auth/sign-in.js";
import { myClubsHandler } from "./my-clubs.js";

let db: Kysely<Database>;
let club: TestClub;
let admin: TestUser;
let teamId: string;
let otherTeamId: string;

/** Someone in the club with no access to either team — the picker's raw material. */
async function createClubPlayer(name: string): Promise<TestUser> {
  return createTestUser(db, club, { systemKey: "player", name });
}

/** Links an account to a roster row as the person themselves (#9, #66). */
async function linkSelf(memberId: string, userId: string): Promise<void> {
  await db
    .insertInto("member_guardians")
    .values({ member_id: memberId, user_id: userId, relation: "self" })
    .execute();
}

/** The roster row for a member, as the coaches view offers it. */
async function memberCandidate(memberId: string) {
  const view = await call(
    listTeamCoachesHandler,
    { teamId },
    { context: admin.context },
  );
  return view.memberCandidates.find((row) => row.memberId === memberId);
}

beforeEach(async () => {
  db = await testDb();
  await truncateAll();
  club = await createTestClub(db);
  admin = await createTestUser(db, club, { systemKey: "admin" });
  teamId = club.teamId;
  otherTeamId = await createTestTeam(db, club.clubId, "P16");
});

afterAll(async () => {
  await closeTestDb();
});

describe("listing", () => {
  it("starts with no coaches and offers the club's other people", async () => {
    const player = await createClubPlayer("Pia Spelare");

    const view = await call(
      listTeamCoachesHandler,
      { teamId },
      { context: admin.context },
    );

    expect(view.coaches).toEqual([]);
    expect(view.invitations).toEqual([]);
    expect(view.candidates.map((row) => row.userId)).toContain(player.userId);
  });

  it("says what each candidate is today, and that an admin cannot be one", async () => {
    const player = await createClubPlayer("Pia Spelare");

    const { candidates } = await call(
      listTeamCoachesHandler,
      { teamId },
      { context: admin.context },
    );

    expect(candidates).toContainEqual(
      expect.objectContaining({
        userId: player.userId,
        currentRole: "Player",
        addable: true,
      }),
    );
    // The caller themselves: adding them here would strip settings.club inside
    // this team and nowhere else (#74).
    expect(candidates).toContainEqual(
      expect.objectContaining({ userId: admin.userId, addable: false }),
    );
  });

  it("offers a coach of another team, with no role in this one", async () => {
    const elsewhere = await createTestUser(db, club, {
      systemKey: "coach",
      name: "Kalle Kollega",
      teamId: otherTeamId,
    });

    const { candidates } = await call(
      listTeamCoachesHandler,
      { teamId },
      { context: admin.context },
    );

    expect(candidates).toContainEqual(
      expect.objectContaining({
        userId: elsewhere.userId,
        currentRole: null,
        addable: true,
      }),
    );
  });
});

describe("adding", () => {
  it("makes a club member a coach of this team only", async () => {
    const player = await createClubPlayer("Pia Spelare");

    const view = await call(
      addTeamCoachHandler,
      { teamId, userId: player.userId },
      { context: admin.context },
    );

    expect(view.coaches).toEqual([
      { userId: player.userId, name: "Pia Spelare", email: player.email },
    ]);
    expect(view.candidates.map((row) => row.userId)).not.toContain(
      player.userId,
    );

    // Their club-wide row is untouched: they are still a player everywhere else.
    const rows = await db
      .selectFrom("memberships")
      .select(["team_id", "role_id"])
      .where("user_id", "=", player.userId)
      .execute();
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({
      team_id: null,
      role_id: club.roleIds["player"],
    });
    expect(rows).toContainEqual({
      team_id: teamId,
      role_id: club.roleIds["coach"],
    });
  });

  it("lets one person coach two teams", async () => {
    const player = await createClubPlayer("Pia Spelare");

    await call(
      addTeamCoachHandler,
      { teamId, userId: player.userId },
      { context: admin.context },
    );
    await call(
      addTeamCoachHandler,
      { teamId: otherTeamId, userId: player.userId },
      { context: admin.context },
    );

    const here = await call(
      listTeamCoachesHandler,
      { teamId },
      { context: admin.context },
    );
    const there = await call(
      listTeamCoachesHandler,
      { teamId: otherTeamId },
      { context: admin.context },
    );

    expect(here.coaches.map((row) => row.userId)).toEqual([player.userId]);
    expect(there.coaches.map((row) => row.userId)).toEqual([player.userId]);
  });

  it("replaces an existing team role rather than stacking a second row", async () => {
    const teamPlayer = await createTestUser(db, club, {
      systemKey: "player",
      name: "Ola Ordinarie",
      teamId,
    });

    await call(
      addTeamCoachHandler,
      { teamId, userId: teamPlayer.userId },
      { context: admin.context },
    );

    const rows = await db
      .selectFrom("memberships")
      .select(["team_id", "role_id"])
      .where("user_id", "=", teamPlayer.userId)
      .execute();
    expect(rows).toEqual([{ team_id: teamId, role_id: club.roleIds["coach"] }]);
  });

  it("refuses to shadow a wider club-wide role", async () => {
    await expect(
      call(
        addTeamCoachHandler,
        { teamId, userId: admin.userId },
        { context: admin.context },
      ),
    ).rejects.toThrow(ORPCError);

    // And the admin still administers the club afterwards.
    const { clubs } = await call(
      myClubsHandler,
      {},
      { context: admin.context },
    );
    expect(
      clubs[0]?.teams.find((team) => team.id === teamId)?.permissions,
    ).toContain("settings.club");
  });

  it("refuses someone who is not in the club at all", async () => {
    const otherClub = await createTestClub(db, "Grannklubben");
    const stranger = await createTestUser(db, otherClub, {
      systemKey: "coach",
      name: "Främling",
    });

    await expect(
      call(
        addTeamCoachHandler,
        { teamId, userId: stranger.userId },
        { context: admin.context },
      ),
    ).rejects.toThrow(ORPCError);
  });
});

describe("removing", () => {
  it("takes away the team membership and leaves the club-wide one", async () => {
    const player = await createClubPlayer("Pia Spelare");
    await call(
      addTeamCoachHandler,
      { teamId, userId: player.userId },
      { context: admin.context },
    );

    const view = await call(
      removeTeamCoachHandler,
      { teamId, userId: player.userId },
      { context: admin.context },
    );

    expect(view.coaches).toEqual([]);
    const rows = await db
      .selectFrom("memberships")
      .select(["team_id", "role_id"])
      .where("user_id", "=", player.userId)
      .execute();
    expect(rows).toEqual([{ team_id: null, role_id: club.roleIds["player"] }]);
  });

  it("removes the coach from one team without touching the other", async () => {
    const coach = await createTestUser(db, club, {
      systemKey: "coach",
      name: "Karin Tränare",
      teamId,
    });
    await call(
      addTeamCoachHandler,
      { teamId: otherTeamId, userId: coach.userId },
      { context: admin.context },
    );

    await call(
      removeTeamCoachHandler,
      { teamId, userId: coach.userId },
      { context: admin.context },
    );

    const there = await call(
      listTeamCoachesHandler,
      { teamId: otherTeamId },
      { context: admin.context },
    );
    expect(there.coaches.map((row) => row.userId)).toEqual([coach.userId]);
  });

  it("refuses when they are not a coach of this team", async () => {
    const player = await createClubPlayer("Pia Spelare");

    await expect(
      call(
        removeTeamCoachHandler,
        { teamId, userId: player.userId },
        { context: admin.context },
      ),
    ).rejects.toThrow(ORPCError);
  });

  it("never deletes a club-wide membership", async () => {
    const clubWideCoach = await createTestUser(db, club, {
      systemKey: "coach",
      name: "Klubbtränare",
    });

    await expect(
      call(
        removeTeamCoachHandler,
        { teamId, userId: clubWideCoach.userId },
        { context: admin.context },
      ),
    ).rejects.toThrow(ORPCError);

    const rows = await db
      .selectFrom("memberships")
      .select("team_id")
      .where("user_id", "=", clubWideCoach.userId)
      .execute();
    expect(rows).toEqual([{ team_id: null }]);
  });
});

describe("appointing somebody by address", () => {
  it("makes the account and the appointment in one press", async () => {
    const view = await call(
      addCoachByEmailHandler,
      { teamId, name: "Ny Tränare", email: "ny.tranare@example.test" },
      { context: admin.context },
    );

    // A coach now — not a pending anything.
    expect(view.coaches).toHaveLength(1);
    expect(view.coaches[0]).toMatchObject({
      name: "Ny Tränare",
      email: "ny.tranare@example.test",
    });
    expect(view.invitations).toEqual([]);
  });

  it("lands the first sign-in on the account that was made for it", async () => {
    await call(
      addCoachByEmailHandler,
      { teamId, name: "Ny Tränare", email: "ny.tranare@example.test" },
      { context: admin.context },
    );

    // What Google sign-in does with a profile whose address is already known:
    // one account, and it is the one holding the Coach role.
    const userId = await signInWithProfile(db, {
      provider: "google",
      subject: "google-subject-1",
      email: "ny.tranare@example.test",
      name: "Ny Tränare",
      imageUrl: null,
    });

    const view = await call(
      listTeamCoachesHandler,
      { teamId },
      { context: admin.context },
    );
    expect(view.coaches.map((row) => row.userId)).toEqual([userId]);
  });

  it("reuses an existing account rather than making a second one", async () => {
    const player = await createClubPlayer("Pia Spelare");

    const view = await call(
      addCoachByEmailHandler,
      // Case is not identity: a spreadsheet's capitals are the same person.
      { teamId, name: "Ignorerat Namn", email: player.email.toUpperCase() },
      { context: admin.context },
    );

    expect(view.coaches.map((row) => row.userId)).toEqual([player.userId]);
    // The account keeps its own name — that is its owner's, not a form's.
    expect(view.coaches[0]?.name).toBe("Pia Spelare");
    const accounts = await db
      .selectFrom("users")
      .select("id")
      .where("email", "ilike", player.email)
      .execute();
    expect(accounts).toHaveLength(1);
  });

  it("refuses when they already coach this team", async () => {
    await call(
      addCoachByEmailHandler,
      { teamId, name: "Ny Tränare", email: "ny.tranare@example.test" },
      { context: admin.context },
    );

    await expect(
      call(
        addCoachByEmailHandler,
        { teamId, name: "Ny Tränare", email: "NY.TRANARE@example.test" },
        { context: admin.context },
      ),
    ).rejects.toThrow(ORPCError);
  });

  it("retires an invitation the appointment has overtaken", async () => {
    const coachRoleId = club.roleIds["coach"]!;
    await db
      .insertInto("invitations")
      .values({
        club_id: club.clubId,
        team_id: teamId,
        role_id: coachRoleId,
        email: "ny.tranare@example.test",
        token: "token-for-the-superseded-invitation",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        created_by: admin.userId,
        member_id: null,
        relation: null,
      })
      .execute();

    const view = await call(
      addCoachByEmailHandler,
      { teamId, name: "Ny Tränare", email: "ny.tranare@example.test" },
      { context: admin.context },
    );

    // Accepting it afterwards would collide with the membership that now
    // exists, so it is closed rather than left to fail in somebody's inbox.
    expect(view.invitations).toEqual([]);
    const invitation = await db
      .selectFrom("invitations")
      .select("revoked_at")
      .where("token", "=", "token-for-the-superseded-invitation")
      .executeTakeFirstOrThrow();
    expect(invitation.revoked_at).not.toBeNull();
  });
});

describe("appointing somebody from the roster", () => {
  it("makes a member with an account a coach straight away", async () => {
    const player = await createClubPlayer("Pia Spelare");
    const memberId = await createTestMember(db, teamId, {
      firstName: "Pia",
      lastName: "Spelare",
    });
    await linkSelf(memberId, player.userId);

    expect(await memberCandidate(memberId)).toMatchObject({
      userId: player.userId,
      action: "add",
      blockedReason: null,
    });

    const view = await call(
      addMemberAsCoachHandler,
      { teamId, memberId },
      { context: admin.context },
    );

    expect(view.outcome).toBe("added");
    expect(view.coaches.map((row) => row.userId)).toEqual([player.userId]);
    // And they are gone from the roster's candidates, being a coach now.
    expect(view.memberCandidates.map((row) => row.memberId)).not.toContain(
      memberId,
    );
  });

  it("creates an account for a member who has only an address", async () => {
    const memberId = await createTestMember(db, teamId, {
      firstName: "Karin",
      lastName: "Tränare",
      email: "karin@example.test",
    });

    expect(await memberCandidate(memberId)).toMatchObject({
      userId: null,
      accountName: null,
      willCreateAccount: true,
      action: "add",
    });

    const view = await call(
      addMemberAsCoachHandler,
      { teamId, memberId },
      { context: admin.context },
    );

    expect(view.outcome).toBe("accountCreated");
    expect(view.coaches).toHaveLength(1);
    expect(view.coaches[0]).toMatchObject({
      name: "Karin Tränare",
      email: "karin@example.test",
    });
    expect(view.invitations).toEqual([]);

    // And it is a real account: signing in with that address lands on it.
    const userId = await signInWithProfile(db, {
      provider: "google",
      subject: "google-subject-karin",
      email: "karin@example.test",
      name: "Karin Tränare",
      imageUrl: null,
    });
    expect(userId).toBe(view.coaches[0]?.userId);
  });

  it("says whose account an address belongs to before appointing it", async () => {
    const parent = await createTestUser(db, club, {
      systemKey: "player",
      name: "Petra Förälder",
      email: "petra@example.test",
    });
    // The child's roster row carries the parent's address, as imports do.
    const memberId = await createTestMember(db, teamId, {
      firstName: "Barn",
      lastName: "Barnsson",
      email: "petra@example.test",
    });

    expect(await memberCandidate(memberId)).toMatchObject({
      userId: parent.userId,
      accountName: "Petra Förälder",
      willCreateAccount: false,
      action: "add",
    });

    const view = await call(
      addMemberAsCoachHandler,
      { teamId, memberId },
      { context: admin.context },
    );

    expect(view.outcome).toBe("added");
    expect(view.coaches.map((row) => row.userId)).toEqual([parent.userId]);
  });

  it("retires an invitation the appointment has overtaken", async () => {
    const memberId = await createTestMember(db, teamId, {
      firstName: "Karin",
      lastName: "Tränare",
      email: "karin@example.test",
    });
    await db
      .insertInto("invitations")
      .values({
        club_id: club.clubId,
        team_id: teamId,
        role_id: club.roleIds["coach"]!,
        email: "karin@example.test",
        token: "token-superseded-by-the-roster",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        created_by: admin.userId,
        member_id: null,
        relation: null,
      })
      .execute();

    const view = await call(
      addMemberAsCoachHandler,
      { teamId, memberId },
      { context: admin.context },
    );
    expect(view.invitations).toEqual([]);
  });

  it("blocks a member with neither account nor address", async () => {
    const memberId = await createTestMember(db, teamId, {
      firstName: "Ove",
      lastName: "Okontaktbar",
    });

    expect(await memberCandidate(memberId)).toMatchObject({
      action: "blocked",
      blockedReason: "noEmail",
    });

    await expect(
      call(
        addMemberAsCoachHandler,
        { teamId, memberId },
        { context: admin.context },
      ),
    ).rejects.toThrow(ORPCError);
  });

  it("is idempotent — appointing the same member twice leaves one coach", async () => {
    const memberId = await createTestMember(db, teamId, {
      firstName: "Karin",
      lastName: "Tränare",
      email: "karin@example.test",
    });
    await call(
      addMemberAsCoachHandler,
      { teamId, memberId },
      { context: admin.context },
    );

    // Gone from the roster's candidates, so the dialog cannot offer it again —
    // but a second call must not make a second account either.
    expect(await memberCandidate(memberId)).toBeUndefined();
    const view = await call(
      addMemberAsCoachHandler,
      { teamId, memberId },
      { context: admin.context },
    );
    expect(view.coaches).toHaveLength(1);
    const accounts = await db
      .selectFrom("users")
      .select("id")
      .where("email", "=", "karin@example.test")
      .execute();
    expect(accounts).toHaveLength(1);
  });

  it("refuses to shadow a wider role, from the roster too", async () => {
    const memberId = await createTestMember(db, teamId, {
      firstName: "Adam",
      lastName: "Admin",
    });
    await linkSelf(memberId, admin.userId);

    expect(await memberCandidate(memberId)).toMatchObject({
      action: "blocked",
      blockedReason: "widerAccess",
    });

    await expect(
      call(
        addMemberAsCoachHandler,
        { teamId, memberId },
        { context: admin.context },
      ),
    ).rejects.toThrow(ORPCError);
  });

  it("only ever offers this team's live roster", async () => {
    const here = await createTestMember(db, teamId, {
      firstName: "Här",
      lastName: "Hansson",
      email: "har@example.test",
    });
    const elsewhere = await createTestMember(db, otherTeamId, {
      firstName: "Där",
      lastName: "Davidsson",
      email: "dar@example.test",
    });
    const archived = await createTestMember(db, teamId, {
      firstName: "Arkiv",
      lastName: "Arkivsson",
      email: "arkiv@example.test",
    });
    await db
      .updateTable("members")
      .set({ archived: true })
      .where("id", "=", archived)
      .execute();

    const view = await call(
      listTeamCoachesHandler,
      { teamId },
      { context: admin.context },
    );
    expect(view.memberCandidates.map((row) => row.memberId)).toEqual([here]);

    // An archived member is no longer on this roster, and the handler says so
    // rather than quietly appointing them.
    await expect(
      call(
        addMemberAsCoachHandler,
        { teamId, memberId: archived },
        { context: admin.context },
      ),
    ).rejects.toThrow(ORPCError);
    await expect(
      call(
        addMemberAsCoachHandler,
        { teamId, memberId: elsewhere },
        { context: admin.context },
      ),
    ).rejects.toThrow(ORPCError);
  });

  it("does not offer a member whose guardian has an account — only the member's own", async () => {
    const parent = await createClubPlayer("Petra Förälder");
    const memberId = await createTestMember(db, teamId, {
      firstName: "Barn",
      lastName: "Barnsson",
    });
    await db
      .insertInto("member_guardians")
      .values({
        member_id: memberId,
        user_id: parent.userId,
        relation: "guardian",
      })
      .execute();

    // The child has no account of their own; the parent's is theirs, and shows
    // up under the club's users where it says Petra rather than Barn.
    expect(await memberCandidate(memberId)).toMatchObject({
      userId: null,
      action: "blocked",
      blockedReason: "noEmail",
    });
  });
});

describe("the gate", () => {
  it("refuses a coach of the team — appointing coaches is the club's call", async () => {
    const coach = await createTestUser(db, club, {
      systemKey: "coach",
      name: "Karin Tränare",
      teamId,
    });
    const player = await createClubPlayer("Pia Spelare");

    await expect(
      call(listTeamCoachesHandler, { teamId }, { context: coach.context }),
    ).rejects.toThrow(ORPCError);

    await expect(
      call(
        addTeamCoachHandler,
        { teamId, userId: player.userId },
        { context: coach.context },
      ),
    ).rejects.toThrow(ORPCError);

    // The roster route is the same act by another door, and is gated the same.
    const memberId = await createTestMember(db, teamId, {
      firstName: "Pia",
      lastName: "Spelare",
      email: "pia@example.test",
    });
    await expect(
      call(
        addMemberAsCoachHandler,
        { teamId, memberId },
        { context: coach.context },
      ),
    ).rejects.toThrow(ORPCError);
  });

  it("refuses an admin of another club", async () => {
    const otherClub = await createTestClub(db, "Grannklubben");
    const outsider = await createTestUser(db, otherClub, {
      systemKey: "admin",
      name: "Annan Admin",
    });

    await expect(
      call(listTeamCoachesHandler, { teamId }, { context: outsider.context }),
    ).rejects.toThrow(ORPCError);
  });
});
