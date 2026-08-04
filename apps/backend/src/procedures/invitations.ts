/** Invitation CRUD and acceptance (ADR-004). */
import { randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Invitation } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { invitationStatus } from "../invitations/status.js";
import { os, requireUser } from "../orpc.js";
import { requireClubPermission } from "../tenancy/membership.js";

const DEFAULT_EXPIRY_DAYS = 14;

/** Row shape shared by the admin-facing queries (invitation + joined names). */
interface InvitationJoinRow {
  id: string;
  club_id: string;
  team_id: string | null;
  team_name: string | null;
  role_id: string;
  role_name: string;
  email: string | null;
  token: string;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

function toInvitation(row: InvitationJoinRow): Invitation {
  return {
    id: row.id,
    clubId: row.club_id,
    teamId: row.team_id,
    teamName: row.team_name,
    roleId: row.role_id,
    roleName: row.role_name,
    email: row.email,
    token: row.token,
    status: invitationStatus({
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      revokedAt: row.revoked_at,
    }),
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

function invitationSelect(db: Kysely<Database>) {
  return db
    .selectFrom("invitations")
    .innerJoin("roles", "roles.id", "invitations.role_id")
    .leftJoin("teams", "teams.id", "invitations.team_id")
    .select([
      "invitations.id",
      "invitations.club_id",
      "invitations.team_id",
      "teams.name as team_name",
      "invitations.role_id",
      "roles.name as role_name",
      "invitations.email",
      "invitations.token",
      "invitations.expires_at",
      "invitations.used_at",
      "invitations.revoked_at",
      "invitations.created_at",
    ]);
}

export const createInvitationHandler = os.createInvitation.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireClubPermission(db, user.id, input.clubId, "settings.club");

    // The role must belong to the club; a team, if given, must too — never
    // trust client-supplied ids to cross tenant boundaries.
    const role = await db
      .selectFrom("roles")
      .select("id")
      .where("id", "=", input.roleId)
      .where("club_id", "=", input.clubId)
      .executeTakeFirst();
    if (!role) {
      throw new ORPCError("NOT_FOUND", { message: "Role not found" });
    }

    if (input.teamId != null) {
      const team = await db
        .selectFrom("teams")
        .select("id")
        .where("id", "=", input.teamId)
        .where("club_id", "=", input.clubId)
        .executeTakeFirst();
      if (!team) {
        throw new ORPCError("NOT_FOUND", { message: "Team not found" });
      }
    }

    // Member-bound (guardian) invitation (#9): the member must belong to a
    // team in this club.
    if (input.memberId != null) {
      const member = await db
        .selectFrom("members")
        .innerJoin("teams", "teams.id", "members.team_id")
        .select("members.id")
        .where("members.id", "=", input.memberId)
        .where("teams.club_id", "=", input.clubId)
        .executeTakeFirst();
      if (!member) {
        throw new ORPCError("NOT_FOUND", { message: "Member not found" });
      }
    }

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(
      Date.now() +
        (input.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000
    );

    const inserted = await db
      .insertInto("invitations")
      .values({
        club_id: input.clubId,
        team_id: input.teamId ?? null,
        role_id: input.roleId,
        email: input.email ?? null,
        token,
        expires_at: expiresAt,
        created_by: user.id,
        member_id: input.memberId ?? null,
        relation: input.memberId != null ? (input.relation ?? "guardian") : null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const row = await invitationSelect(db)
      .where("invitations.id", "=", inserted.id)
      .executeTakeFirstOrThrow();
    return { invitation: toInvitation(row as InvitationJoinRow) };
  }
);

export const listInvitationsHandler = os.listInvitations.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireClubPermission(db, user.id, input.clubId, "settings.club");

    const rows = await invitationSelect(db)
      .where("invitations.club_id", "=", input.clubId)
      .orderBy("invitations.created_at", "desc")
      .execute();
    return {
      invitations: rows.map((row) => toInvitation(row as InvitationJoinRow)),
    };
  }
);

export const revokeInvitationHandler = os.revokeInvitation.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireClubPermission(db, user.id, input.clubId, "settings.club");

    const result = await db
      .updateTable("invitations")
      .set({ revoked_at: new Date() })
      .where("id", "=", input.invitationId)
      .where("club_id", "=", input.clubId)
      .where("revoked_at", "is", null)
      .where("used_at", "is", null)
      .executeTakeFirst();

    if (result.numUpdatedRows === 0n) {
      throw new ORPCError("NOT_FOUND", {
        message: "Invitation not found or already used/revoked",
      });
    }
    return { revoked: true as const };
  }
);

/** Public: resolve an invitation token to the info shown before sign-in. */
export const getInvitationHandler = os.getInvitation.handler(
  async ({ input }) => {
    const db = getDb();
    const row = await db
      .selectFrom("invitations")
      .innerJoin("clubs", "clubs.id", "invitations.club_id")
      .innerJoin("roles", "roles.id", "invitations.role_id")
      .leftJoin("teams", "teams.id", "invitations.team_id")
      .select([
        "clubs.name as club_name",
        "teams.name as team_name",
        "roles.name as role_name",
        "invitations.email",
        "invitations.expires_at",
        "invitations.used_at",
        "invitations.revoked_at",
      ])
      .where("invitations.token", "=", input.token)
      .executeTakeFirst();

    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Invitation not found" });
    }

    return {
      invitation: {
        clubName: row.club_name,
        teamName: row.team_name,
        roleName: row.role_name,
        email: row.email,
        status: invitationStatus({
          expiresAt: row.expires_at,
          usedAt: row.used_at,
          revokedAt: row.revoked_at,
        }),
      },
    };
  }
);

/**
 * Folds an imported contact into the account that just accepted (#65).
 *
 * The row was written by an import as data about a person with no account;
 * this is the moment it becomes a person with one. Compared in application
 * code rather than SQL so the same case-folding is used as everywhere else.
 */
async function claimImportedContact(
  trx: Kysely<Database>,
  memberId: string,
  user: { id: string; email: string }
): Promise<void> {
  const contacts = await trx
    .selectFrom("member_contacts")
    .select(["id", "email"])
    .where("member_id", "=", memberId)
    .where("user_id", "is", null)
    .execute();

  const wanted = user.email.trim().toLowerCase();
  const match = contacts.find(
    (contact) => contact.email?.trim().toLowerCase() === wanted
  );
  if (!match) return;

  await trx
    .updateTable("member_contacts")
    .set({ user_id: user.id })
    .where("id", "=", match.id)
    .execute();
}

export const acceptInvitationHandler = os.acceptInvitation.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();

    return db.transaction().execute(async (trx) => {
      // Lock the row so two concurrent accepts can't both consume it.
      const invitation = await trx
        .selectFrom("invitations")
        .selectAll()
        .where("token", "=", input.token)
        .forUpdate()
        .executeTakeFirst();

      if (!invitation) {
        throw new ORPCError("NOT_FOUND", { message: "Invitation not found" });
      }

      const status = invitationStatus({
        expiresAt: invitation.expires_at,
        usedAt: invitation.used_at,
        revokedAt: invitation.revoked_at,
      });
      if (status !== "active") {
        throw new ORPCError("BAD_REQUEST", {
          message: `Invitation is ${status}`,
        });
      }

      // An email-restricted invitation may only be accepted by that address.
      if (
        invitation.email !== null &&
        invitation.email.toLowerCase() !== user.email.toLowerCase()
      ) {
        throw new ORPCError("FORBIDDEN", {
          message: "This invitation is for a different email address",
        });
      }

      if (invitation.member_id != null) {
        // A club-wide membership says "this is my role everywhere in this
        // club". Adding a team-scoped guardian row alongside it would carve
        // out a silent exception in one team — and because requireTeamAccess
        // prefers the team-scoped row, a coach who accepted an invitation for
        // their own child stopped being a coach there (#74).
        //
        // Scoping someone down in a single team is a real thing a club may
        // want; it is just not something a guardian invitation should do by
        // itself. An admin does it deliberately in settings.
        const clubWide = await trx
          .selectFrom("memberships")
          .select("id")
          .where("user_id", "=", user.id)
          .where("club_id", "=", invitation.club_id)
          .where("team_id", "is", null)
          .executeTakeFirst();

        if (!clubWide) {
          await trx
            .insertInto("memberships")
            .values({
              user_id: user.id,
              club_id: invitation.club_id,
              team_id: invitation.team_id,
              role_id: invitation.role_id,
            })
            // Matches memberships_user_club_team_uq, which is NULLS NOT
            // DISTINCT so a club-wide row (team_id null) collides with itself
            // rather than stacking up. Narrowing this to (user_id, club_id) —
            // as this briefly did — matches no constraint on a correctly
            // migrated database, and would also forbid the thing the
            // constraint exists to allow: a player in one team who coaches
            // another.
            .onConflict((oc) =>
              oc.columns(["user_id", "club_id", "team_id"]).doNothing()
            )
            .execute();
        }

        await trx
          .insertInto("member_guardians")
          .values({
            member_id: invitation.member_id,
            user_id: user.id,
            relation: invitation.relation ?? "guardian",
          })
          .onConflict((oc) =>
            oc
              .columns(["member_id", "user_id"])
              .doUpdateSet({ relation: invitation.relation ?? "guardian" })
          )
          .execute();

        await claimImportedContact(trx, invitation.member_id, user);

        // Accepting for oneself is the one moment the member's own address can
        // be set without guessing: until now it was probably a parent's, and at
        // eighteen there is no parent in between any more. See "Growing up" in
        // docs/product/member-import.md.
        if (invitation.relation === "self") {
          await trx
            .updateTable("members")
            .set({ email: user.email, updated_at: new Date() })
            .where("id", "=", invitation.member_id)
            .execute();
        }
      } else {
        // Plain invitation: a duplicate membership means "already a member".
        try {
          await trx
            .insertInto("memberships")
            .values({
              user_id: user.id,
              club_id: invitation.club_id,
              team_id: invitation.team_id,
              role_id: invitation.role_id,
            })
            .execute();
        } catch {
          throw new ORPCError("CONFLICT", {
            message: "You are already a member of this club or team",
          });
        }
      }

      await trx
        .updateTable("invitations")
        .set({ used_at: new Date(), used_by: user.id })
        .where("id", "=", invitation.id)
        .execute();

      return { clubId: invitation.club_id, teamId: invitation.team_id };
    });
  }
);
