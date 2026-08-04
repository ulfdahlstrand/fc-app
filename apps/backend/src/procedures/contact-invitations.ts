/**
 * Turning imported contacts into invitations (#65).
 *
 * An imported `member_contacts` row is a parent the club knows about but
 * cannot reach through the app. This is what closes that gap, in one action
 * for a whole roster rather than one dialog per family.
 *
 * **Why `members.manage` and not `settings.club`.** `createInvitation` lets a
 * caller hand out any role in the club, so it is rightly an admin action. This
 * cannot: the role is always the club's seeded guardian role, the invitation is
 * always bound to one member of one team, and the address always comes from a
 * contact already stored against that member. A coach inviting the parents of
 * their own players is inside a coach's remit; handing out club roles is not.
 */
import { randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

const EXPIRY_DAYS = 30;

interface InvitableContact {
  id: string;
  memberId: string;
  email: string;
  relation: string | null;
}

/**
 * Contacts worth inviting, and a tally of the ones that are not. A contact is
 * skipped when it has no address, already has an account, or already has an
 * invitation nobody has used yet — re-running must not fill an inbox.
 */
async function findInvitable(
  db: Kysely<Database>,
  teamId: string,
  memberIds: string[] | undefined
): Promise<{
  contacts: InvitableContact[];
  skippedNoEmail: number;
  skippedHasAccount: number;
  skippedAlreadyInvited: number;
}> {
  let query = db
    .selectFrom("member_contacts")
    .innerJoin("members", "members.id", "member_contacts.member_id")
    .select([
      "member_contacts.id",
      "member_contacts.member_id",
      "member_contacts.email",
      "member_contacts.relation",
      "member_contacts.user_id",
    ])
    .where("members.team_id", "=", teamId);

  if (memberIds !== undefined) {
    if (memberIds.length === 0) {
      return {
        contacts: [],
        skippedNoEmail: 0,
        skippedHasAccount: 0,
        skippedAlreadyInvited: 0,
      };
    }
    query = query.where("member_contacts.member_id", "in", memberIds);
  }

  const rows = await query.execute();

  const live = await db
    .selectFrom("invitations")
    .select(["member_id", "email"])
    .where("member_id", "is not", null)
    .where("used_at", "is", null)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", new Date())
    .execute();
  const liveKeys = new Set(
    live.map((row) => `${row.member_id}|${row.email?.trim().toLowerCase() ?? ""}`)
  );

  const contacts: InvitableContact[] = [];
  let skippedNoEmail = 0;
  let skippedHasAccount = 0;
  let skippedAlreadyInvited = 0;

  for (const row of rows) {
    const email = row.email?.trim() ?? "";
    if (email === "") {
      skippedNoEmail += 1;
      continue;
    }
    if (row.user_id !== null) {
      skippedHasAccount += 1;
      continue;
    }
    if (liveKeys.has(`${row.member_id}|${email.toLowerCase()}`)) {
      skippedAlreadyInvited += 1;
      continue;
    }
    contacts.push({
      id: row.id,
      memberId: row.member_id,
      email,
      relation: row.relation,
    });
  }

  return { contacts, skippedNoEmail, skippedHasAccount, skippedAlreadyInvited };
}

export const pendingContactInvitesHandler = os.pendingContactInvites.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    const { contacts } = await findInvitable(db, input.teamId, undefined);
    return { invitable: contacts.length };
  }
);

export const inviteMemberContactsHandler = os.inviteMemberContacts.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const { clubId } = await requireTeamPermission(
      db,
      user.id,
      input.teamId,
      "members.manage"
    );

    const guardianRole = await db
      .selectFrom("roles")
      .select("id")
      .where("club_id", "=", clubId)
      .where("system_key", "=", "guardian")
      .executeTakeFirst();
    if (!guardianRole) {
      throw new ORPCError("NOT_FOUND", {
        message: "This club has no guardian role",
      });
    }

    const found = await findInvitable(db, input.teamId, input.memberIds);
    if (found.contacts.length === 0) {
      return {
        invited: 0,
        skippedNoEmail: found.skippedNoEmail,
        skippedHasAccount: found.skippedHasAccount,
        skippedAlreadyInvited: found.skippedAlreadyInvited,
      };
    }

    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // One transaction: a roster's worth of invitations is a single act, and a
    // half-sent batch is worse than none — nobody could tell who was missed.
    await db.transaction().execute(async (trx) => {
      for (const contact of found.contacts) {
        await trx
          .insertInto("invitations")
          .values({
            club_id: clubId,
            team_id: input.teamId,
            role_id: guardianRole.id,
            email: contact.email,
            token: randomBytes(24).toString("base64url"),
            expires_at: expiresAt,
            created_by: user.id,
            member_id: contact.memberId,
            // The file's own word ("Mamma") is not the app's relation type;
            // everyone invited this way is a guardian (ADR-016's enum).
            relation: "guardian",
          })
          .execute();
      }
    });

    return {
      invited: found.contacts.length,
      skippedNoEmail: found.skippedNoEmail,
      skippedHasAccount: found.skippedHasAccount,
      skippedAlreadyInvited: found.skippedAlreadyInvited,
    };
  }
);
