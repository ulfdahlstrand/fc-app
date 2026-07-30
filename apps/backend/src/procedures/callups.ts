/** Squad selection. A squad is a draft until published (ADR-013). */
import { ORPCError } from "@orpc/server";
import type { Kysely, Selectable } from "kysely";
import type {
  Callup,
  CallupInvitation,
  CallupResponse,
} from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type {
  CallupInvitationsTable,
  CallupsTable,
  Database,
} from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

/** Call-ups (issue #16) — the matchtrupp. */
function toCallup(row: Selectable<CallupsTable>): Callup {
  return {
    id: row.id,
    activityId: row.activity_id,
    note: row.note,
    published: row.published,
  };
}

export function toInvitation(
  row: Selectable<CallupInvitationsTable> & { responder_name?: string | null }
): CallupInvitation {
  return {
    memberId: row.member_id,
    response: row.response as CallupResponse,
    respondedAt: row.responded_at?.toISOString() ?? null,
    responseNote: row.response_note,
    respondedBy:
      row.responded_at === null
        ? null
        : {
            userId: row.responded_by_user_id,
            name: row.responder_name ?? null,
            onBehalf: row.responded_on_behalf,
          },
  };
}

/** Confirms the activity belongs to the team before anything touches it. */
async function requireActivity(
  db: Kysely<Database>,
  teamId: string,
  activityId: string
): Promise<void> {
  const activity = await db
    .selectFrom("activities")
    .select("id")
    .where("id", "=", activityId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!activity) {
    throw new ORPCError("NOT_FOUND", { message: "Activity not found" });
  }
}

async function loadCallup(
  db: Kysely<Database>,
  activityId: string
): Promise<Selectable<CallupsTable> | undefined> {
  return await db
    .selectFrom("callups")
    .selectAll()
    .where("activity_id", "=", activityId)
    .executeTakeFirst();
}

async function loadInvitations(
  db: Kysely<Database>,
  callupId: string
): Promise<CallupInvitation[]> {
  // Left join: the responder's account may since have been removed, and the
  // answer outlives it.
  const rows = await db
    .selectFrom("callup_invitations")
    .leftJoin("users", "users.id", "callup_invitations.responded_by_user_id")
    .selectAll("callup_invitations")
    .select("users.name as responder_name")
    .where("callup_id", "=", callupId)
    .execute();
  return rows.map(toInvitation);
}

export const getCallupHandler = os.getCallup.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    await requireActivity(db, input.teamId, input.activityId);

    // An activity has no call-up until a squad is first saved; that is a
    // null, not an empty one, so the UI can tell "not started" from "emptied".
    const callup = await loadCallup(db, input.activityId);
    if (!callup) return { callup: null, invitations: [] };

    return {
      callup: toCallup(callup),
      invitations: await loadInvitations(db, callup.id),
    };
  }
);

export const setCallupSquadHandler = os.setCallupSquad.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "callups.manage");

    await requireActivity(db, input.teamId, input.activityId);

    const memberIds = [...new Set(input.memberIds)];
    if (memberIds.length > 0) {
      const members = await db
        .selectFrom("members")
        .select("id")
        .where("id", "in", memberIds)
        .where("team_id", "=", input.teamId)
        .execute();
      if (members.length !== memberIds.length) {
        throw new ORPCError("NOT_FOUND", {
          message: "One of those members is not in this team",
        });
      }
    }

    // One transaction: a squad that half-saved would leave a coach unsure who
    // has actually been called up.
    const callup = await db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom("callups")
        .selectAll()
        .where("activity_id", "=", input.activityId)
        .executeTakeFirst();

      const row =
        existing ??
        (await trx
          .insertInto("callups")
          .values({ activity_id: input.activityId })
          .returningAll()
          .executeTakeFirstOrThrow());

      // Everyone dropped from the squad loses their invitation. Removing a
      // member who declined is the ordinary way to replace them (#16 AC).
      let remove = trx
        .deleteFrom("callup_invitations")
        .where("callup_id", "=", row.id);
      if (memberIds.length > 0) {
        remove = remove.where("member_id", "not in", memberIds);
      }
      await remove.execute();

      if (memberIds.length > 0) {
        // `doNothing`, not an update: a member already in the squad keeps the
        // answer they gave. Saving the squad again must never discard a reply.
        await trx
          .insertInto("callup_invitations")
          .values(
            memberIds.map((memberId) => ({
              callup_id: row.id,
              member_id: memberId,
            }))
          )
          .onConflict((oc) =>
            oc.columns(["callup_id", "member_id"]).doNothing()
          )
          .execute();
      }

      await trx
        .updateTable("callups")
        .set({ updated_at: new Date() })
        .where("id", "=", row.id)
        .execute();

      return row;
    });

    return {
      callup: toCallup(callup),
      invitations: await loadInvitations(db, callup.id),
    };
  }
);

export const updateCallupHandler = os.updateCallup.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "callups.manage");

    await requireActivity(db, input.teamId, input.activityId);

    const existing = await loadCallup(db, input.activityId);
    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Pick a squad before publishing it",
      });
    }

    const updated = await db
      .updateTable("callups")
      .set({
        ...(input.note !== undefined && { note: input.note }),
        ...(input.published !== undefined && { published: input.published }),
        updated_at: new Date(),
      })
      .where("id", "=", existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { callup: toCallup(updated) };
  }
);
