import { ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type {
  GuardianRelation,
  LinkedMember,
  MemberGuardian,
} from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

/** Confirms the member belongs to the team; throws NOT_FOUND otherwise. */
async function requireMemberInTeam(
  db: Kysely<Database>,
  teamId: string,
  memberId: string
): Promise<void> {
  const member = await db
    .selectFrom("members")
    .select("id")
    .where("id", "=", memberId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!member) {
    throw new ORPCError("NOT_FOUND", { message: "Member not found" });
  }
}

async function loadGuardians(
  db: Kysely<Database>,
  memberId: string
): Promise<MemberGuardian[]> {
  const rows = await db
    .selectFrom("member_guardians")
    .innerJoin("users", "users.id", "member_guardians.user_id")
    .select([
      "member_guardians.user_id",
      "users.name",
      "users.email",
      "member_guardians.relation",
    ])
    .where("member_guardians.member_id", "=", memberId)
    .orderBy("users.name")
    .execute();

  return rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    relation: row.relation as GuardianRelation,
  }));
}

export const listMemberGuardiansHandler = os.listMemberGuardians.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");
    await requireMemberInTeam(db, input.teamId, input.memberId);
    return { guardians: await loadGuardians(db, input.memberId) };
  }
);

export const addGuardianHandler = os.addGuardian.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const access = await requireTeamPermission(
      db,
      user.id,
      input.teamId,
      "members.manage"
    );
    await requireMemberInTeam(db, input.teamId, input.memberId);

    // The linked user must already belong to the member's club — you can't
    // link an arbitrary account across tenant boundaries.
    const target = await db
      .selectFrom("memberships")
      .select("user_id")
      .where("user_id", "=", input.userId)
      .where("club_id", "=", access.clubId)
      .executeTakeFirst();
    if (!target) {
      throw new ORPCError("BAD_REQUEST", {
        message: "User is not a member of this club",
      });
    }

    await db
      .insertInto("member_guardians")
      .values({
        member_id: input.memberId,
        user_id: input.userId,
        relation: input.relation,
      })
      .onConflict((oc) =>
        oc
          .columns(["member_id", "user_id"])
          .doUpdateSet({ relation: input.relation })
      )
      .execute();

    return { guardians: await loadGuardians(db, input.memberId) };
  }
);

export const removeGuardianHandler = os.removeGuardian.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.manage");
    await requireMemberInTeam(db, input.teamId, input.memberId);

    await db
      .deleteFrom("member_guardians")
      .where("member_id", "=", input.memberId)
      .where("user_id", "=", input.userId)
      .execute();

    return { guardians: await loadGuardians(db, input.memberId) };
  }
);

export const listClubUsersHandler = os.listClubUsers.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const access = await requireTeamPermission(
      db,
      user.id,
      input.teamId,
      "members.manage"
    );

    const rows = await db
      .selectFrom("memberships")
      .innerJoin("users", "users.id", "memberships.user_id")
      .select(["users.id", "users.name", "users.email"])
      .distinct()
      .where("memberships.club_id", "=", access.clubId)
      .orderBy("users.name")
      .execute();

    return { users: rows };
  }
);

export const myMembersHandler = os.myMembers.handler(async ({ context }) => {
  const user = requireUser(context);
  const db = getDb();

  const rows = await db
    .selectFrom("member_guardians")
    .innerJoin("members", "members.id", "member_guardians.member_id")
    .innerJoin("teams", "teams.id", "members.team_id")
    .innerJoin("clubs", "clubs.id", "teams.club_id")
    .select([
      "members.id as member_id",
      "members.first_name",
      "members.last_name",
      "members.team_id",
      "teams.name as team_name",
      "clubs.name as club_name",
      "member_guardians.relation",
    ])
    .where("member_guardians.user_id", "=", user.id)
    .orderBy("clubs.name")
    .orderBy("members.last_name")
    .execute();

  const members: LinkedMember[] = rows.map((row) => ({
    memberId: row.member_id,
    firstName: row.first_name,
    lastName: row.last_name,
    teamId: row.team_id,
    teamName: row.team_name,
    clubName: row.club_name,
    relation: row.relation as GuardianRelation,
  }));
  return { members };
});
