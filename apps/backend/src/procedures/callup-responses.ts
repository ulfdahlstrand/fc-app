import { ORPCError } from "@orpc/server";
import type { CallupResponse, CallupSummary, MyCallup } from "@fc-app/contracts";
import { requireLinkedMember } from "../callups/linked-members.js";
import { getDb } from "../db/client.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

/**
 * Call-up responses (issue #17).
 *
 * Answering needs `callups.respond` in the team **and** a link to the member
 * (#9) — every player in a squad holds the permission, and none of them may
 * answer for each other. See `callups/linked-members.ts`.
 *
 * The coach's overview needs `members.view`, the same permission the calendar
 * and roster need.
 */
export const respondToCallupHandler = os.respondToCallup.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "callups.respond");
    await requireLinkedMember(db, user.id, input.memberId);

    // The invitation has to exist *and* belong to a published call-up on an
    // activity in this team. An unpublished squad has not been asked yet.
    const invitation = await db
      .selectFrom("callup_invitations")
      .innerJoin("callups", "callups.id", "callup_invitations.callup_id")
      .innerJoin("activities", "activities.id", "callups.activity_id")
      .select([
        "callup_invitations.callup_id",
        "callup_invitations.member_id",
        "callups.published",
      ])
      .where("callup_invitations.member_id", "=", input.memberId)
      .where("callups.activity_id", "=", input.activityId)
      .where("activities.team_id", "=", input.teamId)
      .executeTakeFirst();

    if (!invitation) {
      throw new ORPCError("NOT_FOUND", {
        message: "There is no call-up for that member",
      });
    }
    if (!invitation.published) {
      throw new ORPCError("BAD_REQUEST", {
        message: "That squad has not been published yet",
      });
    }

    const updated = await db
      .updateTable("callup_invitations")
      .set({
        response: input.response,
        responded_at: new Date(),
        // An answer without a note clears any earlier one: the note belongs to
        // the answer, and a stale reason is worse than none.
        response_note: input.note ?? null,
      })
      .where("callup_id", "=", invitation.callup_id)
      .where("member_id", "=", input.memberId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      invitation: {
        memberId: updated.member_id,
        response: updated.response as CallupResponse,
        respondedAt: updated.responded_at?.toISOString() ?? null,
        responseNote: updated.response_note,
      },
    };
  }
);

export const myCallupsHandler = os.myCallups.handler(async ({ context }) => {
  const user = requireUser(context);
  const db = getDb();

  // Driven by the guardian links, not by team membership: this is "what am I
  // being asked", and it spans every club and team the user is linked into.
  const rows = await db
    .selectFrom("callup_invitations")
    .innerJoin("callups", "callups.id", "callup_invitations.callup_id")
    .innerJoin("activities", "activities.id", "callups.activity_id")
    .innerJoin("members", "members.id", "callup_invitations.member_id")
    .innerJoin("member_guardians", (join) =>
      join
        .onRef("member_guardians.member_id", "=", "callup_invitations.member_id")
        .on("member_guardians.user_id", "=", user.id)
    )
    .innerJoin("teams", "teams.id", "activities.team_id")
    .select([
      "activities.team_id as team_id",
      "teams.name as team_name",
      "activities.id as activity_id",
      "activities.starts_at as starts_at",
      "activities.ends_at as ends_at",
      "activities.title as title",
      "activities.activity_type_id as activity_type_id",
      "activities.location as location",
      "callups.note as callup_note",
      "members.id as member_id",
      "members.first_name as first_name",
      "members.last_name as last_name",
      "callup_invitations.response as response",
      "callup_invitations.response_note as response_note",
    ])
    // Only published squads: an unpublished one has not been asked yet.
    .where("callups.published", "=", true)
    .where("activities.cancelled", "=", false)
    // What is still to come. A call-up for last Tuesday is not a question.
    .where("activities.starts_at", ">=", new Date())
    .orderBy("activities.starts_at")
    .execute();

  const callups: MyCallup[] = rows.map((row) => ({
    teamId: row.team_id,
    teamName: row.team_name,
    activityId: row.activity_id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at?.toISOString() ?? null,
    title: row.title,
    activityTypeId: row.activity_type_id,
    location: row.location,
    callupNote: row.callup_note,
    memberId: row.member_id,
    memberName: `${row.first_name} ${row.last_name}`,
    response: row.response as CallupResponse,
    responseNote: row.response_note,
  }));

  return {
    callups,
    pending: callups.filter((one) => one.response === "pending").length,
  };
});

export const listCallupsHandler = os.listCallups.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    let query = db
      .selectFrom("callups")
      .innerJoin("activities", "activities.id", "callups.activity_id")
      .select([
        "callups.id as callup_id",
        "callups.published as published",
        "activities.id as activity_id",
        "activities.starts_at as starts_at",
        "activities.title as title",
        "activities.activity_type_id as activity_type_id",
        "activities.location as location",
        "activities.cancelled as cancelled",
      ])
      .where("activities.team_id", "=", input.teamId);

    if (input.includePast !== true) {
      query = query.where("activities.starts_at", ">=", new Date());
    }

    const rows = await query.orderBy("activities.starts_at").execute();
    if (rows.length === 0) return { callups: [], pending: 0 };

    // One query for every tally, rather than one per call-up.
    const tallies = await db
      .selectFrom("callup_invitations")
      .select(["callup_id", "response"])
      .where(
        "callup_id",
        "in",
        rows.map((row) => row.callup_id)
      )
      .execute();

    const counted = new Map<string, Record<string, number>>();
    for (const tally of tallies) {
      const forCallup = counted.get(tally.callup_id) ?? {};
      forCallup[tally.response] = (forCallup[tally.response] ?? 0) + 1;
      counted.set(tally.callup_id, forCallup);
    }

    const callups: CallupSummary[] = rows.map((row) => {
      const counts = counted.get(row.callup_id) ?? {};
      const accepted = counts["accepted"] ?? 0;
      const declined = counts["declined"] ?? 0;
      const pending = counts["pending"] ?? 0;
      return {
        activityId: row.activity_id,
        startsAt: row.starts_at.toISOString(),
        title: row.title,
        activityTypeId: row.activity_type_id,
        location: row.location,
        cancelled: row.cancelled,
        published: row.published,
        squad: accepted + declined + pending,
        accepted,
        declined,
        pending,
      };
    });

    return {
      callups,
      // Only published squads have questions outstanding; a draft is nobody's
      // to answer yet, so counting it would make the dashboard nag about work
      // the coach has not finished.
      pending: callups
        .filter((one) => one.published)
        .reduce((sum, one) => sum + one.pending, 0),
    };
  }
);
