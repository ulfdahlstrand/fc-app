/**
 * Who coaches a team (#98).
 *
 * The club owns the Coach role; a team owns which accounts hold it. Every write
 * here is one row in `memberships` with `team_id` set, which is what lets the
 * same person coach two teams and be nothing at all in a third.
 *
 * Gated on `settings.club` throughout, not `settings.team`: this is not team
 * configuration, it is who may act inside the club, and that is an admin's
 * decision however narrow the grant (the argument is spelled out in
 * contact-invitations.ts).
 */
import { ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type {
  CoachCandidate,
  Invitation,
  MemberCoachCandidate,
  Permission,
  TeamCoach,
} from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { isDemotion } from "../tenancy/narrowing.js";
import {
  requireClubPermission,
  requireTeamAccess,
} from "../tenancy/membership.js";
import { invitationSelect, toInvitation } from "./invitations.js";
import type { InvitationJoinRow } from "./invitations.js";

/** The club's Coach role, with what it grants. */
interface CoachRole {
  id: string;
  permissions: Permission[];
}

async function requireCoachRole(
  db: Kysely<Database>,
  clubId: string,
): Promise<CoachRole> {
  const role = await db
    .selectFrom("roles")
    .select("id")
    .where("club_id", "=", clubId)
    .where("system_key", "=", "coach")
    .executeTakeFirst();
  if (!role) {
    // Seeded on club creation and undeletable (deleteRole refuses system
    // roles), so this is a database somebody has been in by hand.
    throw new ORPCError("NOT_FOUND", {
      message: "This club has no coach role",
    });
  }

  const permissions = await db
    .selectFrom("role_permissions")
    .select("permission")
    .where("role_id", "=", role.id)
    .execute();

  return {
    id: role.id,
    permissions: permissions.map((row) => row.permission as Permission),
  };
}

interface ClubUserRow {
  userId: string;
  name: string;
  email: string;
  /** Their membership rows in this club, club-wide first. */
  roles: { teamId: string | null; roleId: string; roleName: string }[];
}

/** Every account in the club, with the role each of its memberships holds. */
async function loadClubUsers(
  db: Kysely<Database>,
  clubId: string,
): Promise<ClubUserRow[]> {
  const rows = await db
    .selectFrom("memberships")
    .innerJoin("users", "users.id", "memberships.user_id")
    .innerJoin("roles", "roles.id", "memberships.role_id")
    .select([
      "memberships.user_id",
      "memberships.team_id",
      "memberships.role_id",
      "roles.name as role_name",
      "users.name",
      "users.email",
    ])
    .where("memberships.club_id", "=", clubId)
    .orderBy("users.name")
    .execute();

  const users = new Map<string, ClubUserRow>();
  for (const row of rows) {
    const existing = users.get(row.user_id) ?? {
      userId: row.user_id,
      name: row.name,
      email: row.email,
      roles: [],
    };
    existing.roles.push({
      teamId: row.team_id,
      roleId: row.role_id,
      roleName: row.role_name,
    });
    users.set(row.user_id, existing);
  }
  return [...users.values()];
}

/** What every role in the club grants, so the picker can compare without N queries. */
async function loadRolePermissions(
  db: Kysely<Database>,
  clubId: string,
): Promise<Map<string, Permission[]>> {
  const rows = await db
    .selectFrom("role_permissions")
    .innerJoin("roles", "roles.id", "role_permissions.role_id")
    .select(["role_permissions.role_id", "role_permissions.permission"])
    .where("roles.club_id", "=", clubId)
    .execute();

  const byRole = new Map<string, Permission[]>();
  for (const row of rows) {
    const list = byRole.get(row.role_id) ?? [];
    list.push(row.permission as Permission);
    byRole.set(row.role_id, list);
  }
  return byRole;
}

/**
 * The role a user holds *in this team* today: the team-scoped row if there is
 * one, otherwise the club-wide row. Mirrors requireTeamAccess — the answer has
 * to be the same one the gate would give, or the picker lies.
 */
function effectiveRole(
  user: ClubUserRow,
  teamId: string,
): { roleId: string; roleName: string } | null {
  return (
    user.roles.find((row) => row.teamId === teamId) ??
    user.roles.find((row) => row.teamId === null) ??
    null
  );
}

/** Live invitations for the Coach role in this team. */
async function loadCoachInvitations(
  db: Kysely<Database>,
  clubId: string,
  teamId: string,
  coachRoleId: string,
): Promise<Invitation[]> {
  const rows = await invitationSelect(db)
    .where("invitations.club_id", "=", clubId)
    .where("invitations.team_id", "=", teamId)
    .where("invitations.role_id", "=", coachRoleId)
    .where("invitations.used_at", "is", null)
    .where("invitations.revoked_at", "is", null)
    .where("invitations.expires_at", ">", new Date())
    .orderBy("invitations.created_at", "desc")
    .execute();

  return rows.map((row) => toInvitation(row as InvitationJoinRow));
}

/** A roster row, with the account behind it if the person has ever signed in. */
interface TeamMemberRow {
  memberId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  /** Their own account: a `self` guardian link, never a parent's (#9, #66). */
  userId: string | null;
}

/**
 * The team's live roster, each row carrying the account that *is* that person.
 *
 * `self` and nothing else: a member's guardians are somebody else, and quietly
 * appointing a parent because their child was picked would be the worst kind of
 * helpful. Parents who should coach have accounts of their own and appear among
 * the club's users.
 */
async function loadTeamMembers(
  db: Kysely<Database>,
  teamId: string,
): Promise<TeamMemberRow[]> {
  const rows = await db
    .selectFrom("members")
    .leftJoin("member_guardians", (join) =>
      join
        .onRef("member_guardians.member_id", "=", "members.id")
        .on("member_guardians.relation", "=", "self"),
    )
    .select([
      "members.id",
      "members.first_name",
      "members.last_name",
      "members.email",
      "member_guardians.user_id",
    ])
    .where("members.team_id", "=", teamId)
    .where("members.archived", "=", false)
    .orderBy("members.last_name")
    .orderBy("members.first_name")
    .execute();

  return rows.map((row) => ({
    memberId: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    userId: row.user_id,
  }));
}

/** Everything the section draws, in one place (ADR-015). */
async function loadView(
  db: Kysely<Database>,
  clubId: string,
  teamId: string,
  coachRole: CoachRole,
): Promise<{
  coaches: TeamCoach[];
  invitations: Invitation[];
  candidates: CoachCandidate[];
  memberCandidates: MemberCoachCandidate[];
}> {
  const users = await loadClubUsers(db, clubId);
  const permissionsByRole = await loadRolePermissions(db, clubId);

  const coaches: TeamCoach[] = [];
  const candidates: CoachCandidate[] = [];

  for (const user of users) {
    const isCoachHere = user.roles.some(
      (row) => row.teamId === teamId && row.roleId === coachRole.id,
    );
    if (isCoachHere) {
      coaches.push({ userId: user.userId, name: user.name, email: user.email });
      continue;
    }

    const current = effectiveRole(user, teamId);
    const currentPermissions = current
      ? (permissionsByRole.get(current.roleId) ?? [])
      : [];

    candidates.push({
      userId: user.userId,
      name: user.name,
      email: user.email,
      currentRole: current?.roleName ?? null,
      addable: !isDemotion(currentPermissions, coachRole.permissions),
    });
  }

  const invitations = await loadCoachInvitations(
    db,
    clubId,
    teamId,
    coachRole.id,
  );

  return {
    coaches,
    invitations,
    candidates,
    memberCandidates: await loadMemberCandidates(db, teamId, {
      coachUserIds: new Set(coaches.map((row) => row.userId)),
      candidatesByUserId: new Map(
        candidates.map((row) => [row.userId, row] as const),
      ),
    }),
  };
}

/** Accounts holding any of these addresses, by lower-cased address. */
async function findAccountsByEmail(
  db: Kysely<Database>,
  emails: readonly string[],
): Promise<Map<string, { id: string; name: string }>> {
  const wanted = [
    ...new Set(emails.map((email) => email.trim().toLowerCase())),
  ].filter((email) => email !== "");
  if (wanted.length === 0) return new Map();

  // Compared lower-cased on both sides: addresses arrive from a spreadsheet in
  // whatever case somebody typed, and "Karin@" and "karin@" are one person.
  const rows = await db
    .selectFrom("users")
    .select(["id", "name", "email"])
    .where((eb) => eb(eb.fn("lower", ["email"]), "in", wanted))
    .execute();

  return new Map(
    rows.map((row) => [
      row.email.trim().toLowerCase(),
      { id: row.id, name: row.name },
    ]),
  );
}

/**
 * The roster as coaching candidates: which account each row would appoint, and
 * whether that account has to be made first.
 *
 * Decided here rather than in the dialog so what the row promises and what the
 * handler does cannot drift apart — the handler resolves the same three cases
 * from the same records.
 */
async function loadMemberCandidates(
  db: Kysely<Database>,
  teamId: string,
  context: {
    coachUserIds: Set<string>;
    candidatesByUserId: Map<string, CoachCandidate>;
  },
): Promise<MemberCoachCandidate[]> {
  const members = await loadTeamMembers(db, teamId);
  const accounts = await findAccountsByEmail(
    db,
    members.flatMap((member) => (member.email ? [member.email] : [])),
  );
  const result: MemberCoachCandidate[] = [];

  /** True when the Coach role would take rights this account already holds (#74). */
  const wouldNarrow = (userId: string): boolean =>
    context.candidatesByUserId.get(userId)?.addable === false;

  for (const member of members) {
    const base = {
      memberId: member.memberId,
      firstName: member.firstName,
      lastName: member.lastName,
    };

    // Already coaching this team — they are in the list above, under the name
    // on their account. Resolved the same way the appointment would resolve
    // it, or a member appointed through the address on their row would keep
    // being offered afterwards.
    const alreadyCoaching =
      member.userId ??
      (member.email
        ? accounts.get(member.email.trim().toLowerCase())?.id
        : null);
    if (alreadyCoaching && context.coachUserIds.has(alreadyCoaching)) continue;

    // Their own account, from having signed in: no disclosure needed, it is
    // them.
    if (member.userId) {
      const narrows = wouldNarrow(member.userId);
      result.push({
        ...base,
        userId: member.userId,
        email: member.email,
        accountName: null,
        willCreateAccount: false,
        action: narrows ? "blocked" : "add",
        blockedReason: narrows ? "widerAccess" : null,
      });
      continue;
    }

    const email = member.email?.trim() ?? "";
    if (email === "") {
      result.push({
        ...base,
        userId: null,
        email: null,
        accountName: null,
        willCreateAccount: false,
        action: "blocked",
        blockedReason: "noEmail",
      });
      continue;
    }

    const account = accounts.get(email.toLowerCase());
    if (account) {
      // The address is somebody's account already — quite possibly a parent's,
      // since that is whose address a child's roster row carries. Appointing
      // it is fine; doing so without saying whose account it is, is not.
      const narrows = wouldNarrow(account.id);
      result.push({
        ...base,
        userId: account.id,
        email,
        accountName: account.name,
        willCreateAccount: false,
        action: narrows ? "blocked" : "add",
        blockedReason: narrows ? "widerAccess" : null,
      });
      continue;
    }

    result.push({
      ...base,
      userId: null,
      email,
      accountName: null,
      willCreateAccount: true,
      action: "add",
      blockedReason: null,
    });
  }

  return result;
}

/**
 * Gives an account the Coach role in this team, refusing where that would only
 * take rights away (#74).
 *
 * The membership row is the whole appointment: one person, one role per team.
 * A player in this team becoming its coach is a role change rather than a
 * second row, which is what the ON CONFLICT says.
 */
async function appointCoach(
  db: Kysely<Database>,
  clubId: string,
  teamId: string,
  coachRole: CoachRole,
  target: ClubUserRow | null,
  userId: string,
): Promise<void> {
  if (target) {
    const current = effectiveRole(target, teamId);
    const permissionsByRole = await loadRolePermissions(db, clubId);
    const currentPermissions = current
      ? (permissionsByRole.get(current.roleId) ?? [])
      : [];
    if (isDemotion(currentPermissions, coachRole.permissions)) {
      throw new ORPCError("CONFLICT", {
        message:
          "This user already has wider access to the club; making them a team coach would take it away in this team",
      });
    }
  }

  await db
    .insertInto("memberships")
    .values({
      user_id: userId,
      club_id: clubId,
      team_id: teamId,
      role_id: coachRole.id,
    })
    // Matches memberships_user_club_team_uq.
    .onConflict((oc) =>
      oc
        .columns(["user_id", "club_id", "team_id"])
        .doUpdateSet({ role_id: coachRole.id }),
    )
    .execute();
}

/**
 * The account that holds an address, made if nobody holds it yet.
 *
 * This is what lets an admin finish the job in one press. The row is a real
 * account from the moment it is written, and the first sign-in with that
 * address lands on it rather than making a second one — `signInWithProfile`
 * looks an OAuth profile up by email before creating anything. So nothing has
 * to be accepted for the appointment to be true; all that is left for the
 * coach is to sign in, which they would have had to do anyway.
 *
 * The name is only used when creating. An existing account keeps the name its
 * owner signed up with, which is theirs rather than a roster's to decide.
 */
async function resolveOrCreateAccount(
  db: Kysely<Database>,
  email: string,
  name: string,
): Promise<{ userId: string; created: boolean }> {
  const existing = await db
    .selectFrom("users")
    .select("id")
    .where((eb) => eb(eb.fn("lower", ["email"]), "=", email.toLowerCase()))
    .executeTakeFirst();
  if (existing) return { userId: existing.id, created: false };

  const inserted = await db
    .insertInto("users")
    .values({ email, name, image_url: null })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { userId: inserted.id, created: true };
}

/**
 * Retires any live coach invitation for this address in this team.
 *
 * Appointing somebody answers the question the invitation was asking, and
 * accepting it afterwards would fail on a membership that already exists — a
 * dead link in the list and a confusing minute for whoever clicks it.
 */
async function revokeSupersededInvitations(
  db: Kysely<Database>,
  clubId: string,
  teamId: string,
  coachRoleId: string,
  email: string,
): Promise<void> {
  await db
    .updateTable("invitations")
    .set({ revoked_at: new Date() })
    .where("club_id", "=", clubId)
    .where("team_id", "=", teamId)
    .where("role_id", "=", coachRoleId)
    .where((eb) => eb(eb.fn("lower", ["email"]), "=", email.toLowerCase()))
    .where("used_at", "is", null)
    .where("revoked_at", "is", null)
    .execute();
}

/**
 * Resolves the team, checks the caller may administer its club, and hands back
 * what every handler here needs next.
 */
async function requireCoachAdmin(
  db: Kysely<Database>,
  userId: string,
  teamId: string,
): Promise<{ clubId: string; coachRole: CoachRole }> {
  const { clubId } = await requireTeamAccess(db, userId, teamId);
  await requireClubPermission(db, userId, clubId, "settings.club");
  return { clubId, coachRole: await requireCoachRole(db, clubId) };
}

export const listTeamCoachesHandler = os.listTeamCoaches.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const { clubId, coachRole } = await requireCoachAdmin(
      db,
      user.id,
      input.teamId,
    );
    return loadView(db, clubId, input.teamId, coachRole);
  },
);

export const addTeamCoachHandler = os.addTeamCoach.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const { clubId, coachRole } = await requireCoachAdmin(
      db,
      user.id,
      input.teamId,
    );

    const target = (await loadClubUsers(db, clubId)).find(
      (row) => row.userId === input.userId,
    );
    if (!target) {
      throw new ORPCError("BAD_REQUEST", {
        message: "User is not a member of this club",
      });
    }

    await appointCoach(
      db,
      clubId,
      input.teamId,
      coachRole,
      target,
      input.userId,
    );
    return loadView(db, clubId, input.teamId, coachRole);
  },
);

/**
 * Appointing somebody straight off the roster (#98).
 *
 * The admin means one thing — "make Karin a coach" — and it is true when this
 * returns. Three routes to the same end, taken without asking because the row
 * in the picker already said which one this is: the account she signed in
 * with, the account that holds the address on her roster row, or an account
 * created for that address here and now.
 *
 * `outcome` distinguishes the last case, which is the only one where the admin
 * has told the app something it did not know.
 */
export const addMemberAsCoachHandler = os.addMemberAsCoach.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const { clubId, coachRole } = await requireCoachAdmin(
      db,
      user.id,
      input.teamId,
    );

    const member = (await loadTeamMembers(db, input.teamId)).find(
      (row) => row.memberId === input.memberId,
    );
    if (!member) {
      // Also the answer for an archived member: no longer on this roster.
      throw new ORPCError("NOT_FOUND", {
        message: "Member not found in this team",
      });
    }

    const email = member.email?.trim() ?? "";
    if (!member.userId && email === "") {
      // Nothing to appoint. An address is what an account is reached by, so
      // this is a job for the roster page rather than a failure here.
      throw new ORPCError("BAD_REQUEST", {
        message:
          "This member has no account and no email address — add an address to the member first",
      });
    }

    const resolved = member.userId
      ? { userId: member.userId, created: false }
      : await resolveOrCreateAccount(
          db,
          email,
          `${member.firstName} ${member.lastName}`.trim(),
        );

    const clubUsers = await loadClubUsers(db, clubId);
    await appointCoach(
      db,
      clubId,
      input.teamId,
      coachRole,
      clubUsers.find((row) => row.userId === resolved.userId) ?? null,
      resolved.userId,
    );

    if (email !== "") {
      await revokeSupersededInvitations(
        db,
        clubId,
        input.teamId,
        coachRole.id,
        email,
      );
    }

    return {
      ...(await loadView(db, clubId, input.teamId, coachRole)),
      outcome: resolved.created
        ? ("accountCreated" as const)
        : ("added" as const),
    };
  },
);

export const removeTeamCoachHandler = os.removeTeamCoach.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const { clubId, coachRole } = await requireCoachAdmin(
      db,
      user.id,
      input.teamId,
    );

    // Team-scoped and coach-role only, both stated in the WHERE clause: this
    // must never be able to delete somebody's club-wide membership, which is
    // their place in the club rather than their job in this team.
    const result = await db
      .deleteFrom("memberships")
      .where("user_id", "=", input.userId)
      .where("club_id", "=", clubId)
      .where("team_id", "=", input.teamId)
      .where("role_id", "=", coachRole.id)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new ORPCError("NOT_FOUND", {
        message: "This user is not a coach of this team",
      });
    }

    return loadView(db, clubId, input.teamId, coachRole);
  },
);

/**
 * Appointing somebody who is in neither list, by address (#98).
 *
 * Same ending as every other route here: the account exists and holds the role
 * when this returns. Nobody waits on anybody.
 */
export const addCoachByEmailHandler = os.addCoachByEmail.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const { clubId, coachRole } = await requireCoachAdmin(
      db,
      user.id,
      input.teamId,
    );

    const email = input.email.trim();
    const resolved = await resolveOrCreateAccount(db, email, input.name.trim());

    const clubUsers = await loadClubUsers(db, clubId);
    if (
      clubUsers.some(
        (row) =>
          row.userId === resolved.userId &&
          row.roles.some(
            (membership) =>
              membership.teamId === input.teamId &&
              membership.roleId === coachRole.id,
          ),
      )
    ) {
      throw new ORPCError("CONFLICT", {
        message: "That address already coaches this team",
      });
    }

    await appointCoach(
      db,
      clubId,
      input.teamId,
      coachRole,
      clubUsers.find((row) => row.userId === resolved.userId) ?? null,
      resolved.userId,
    );
    await revokeSupersededInvitations(
      db,
      clubId,
      input.teamId,
      coachRole.id,
      email,
    );

    return loadView(db, clubId, input.teamId, coachRole);
  },
);
