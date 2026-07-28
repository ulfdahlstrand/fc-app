import { ORPCError } from "@orpc/server";
import type { Kysely, Selectable } from "kysely";
import type { Activity } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { ActivitiesTable, Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

/**
 * Activities (issue #12).
 *
 * Reading is gated on `members.view`, the same permission the calendar's
 * activity types (#11) need — a role that can see the team's people can see
 * its calendar, and a role granted only one of the two would render a calendar
 * it cannot label. Writing needs `activities.manage`.
 */
function toActivity(row: Selectable<ActivitiesTable>): Activity {
  return {
    id: row.id,
    teamId: row.team_id,
    activityTypeId: row.activity_type_id,
    title: row.title,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at?.toISOString() ?? null,
    location: row.location,
    notes: row.notes,
    cancelled: row.cancelled,
  };
}

async function loadActivity(
  db: Kysely<Database>,
  teamId: string,
  activityId: string
): Promise<Selectable<ActivitiesTable>> {
  const row = await db
    .selectFrom("activities")
    .selectAll()
    .where("id", "=", activityId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Activity not found" });
  }
  return row;
}

/**
 * An activity may only point at a type belonging to the same team, and a new
 * or retyped activity may not use a retired one. Existing activities keep
 * their archived type — that is the whole reason types are archived.
 */
async function requireUsableType(
  db: Kysely<Database>,
  teamId: string,
  activityTypeId: string
): Promise<void> {
  const type = await db
    .selectFrom("activity_types")
    .select(["id", "archived"])
    .where("id", "=", activityTypeId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!type) {
    throw new ORPCError("NOT_FOUND", { message: "Activity type not found" });
  }
  if (type.archived) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That activity type has been archived",
    });
  }
}

function toDateOrNull(value: string | null | undefined): Date | null {
  return value === null || value === undefined ? null : new Date(value);
}

/** The contract checks this for creates; updates can change one side only. */
function assertEndsAfterStart(startsAt: Date, endsAt: Date | null): void {
  if (endsAt !== null && endsAt.getTime() <= startsAt.getTime()) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The end time must come after the start time",
    });
  }
}

export const listActivitiesHandler = os.listActivities.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    let query = db
      .selectFrom("activities")
      .selectAll()
      .where("team_id", "=", input.teamId);

    // The window is half-open: `to` is the first instant *after* the range, so
    // a month grid and the next one never both claim the same activity.
    if (input.from !== undefined) {
      query = query.where("starts_at", ">=", new Date(input.from));
    }
    if (input.to !== undefined) {
      query = query.where("starts_at", "<", new Date(input.to));
    }
    if (input.activityTypeId !== undefined) {
      query = query.where("activity_type_id", "=", input.activityTypeId);
    }

    // Cancelled activities are returned too — they stay on the calendar,
    // struck through, so nobody turns up at the pitch for them.
    const rows = await query.orderBy("starts_at").execute();
    return { activities: rows.map(toActivity) };
  }
);

export const getActivityHandler = os.getActivity.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    const row = await loadActivity(db, input.teamId, input.activityId);
    return { activity: toActivity(row) };
  }
);

export const createActivityHandler = os.createActivity.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "activities.manage");

    await requireUsableType(db, input.teamId, input.activityTypeId);

    const inserted = await db
      .insertInto("activities")
      .values({
        team_id: input.teamId,
        activity_type_id: input.activityTypeId,
        title: input.title ?? null,
        starts_at: new Date(input.startsAt),
        ends_at: toDateOrNull(input.endsAt),
        location: input.location ?? null,
        notes: input.notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { activity: toActivity(inserted) };
  }
);

export const updateActivityHandler = os.updateActivity.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "activities.manage");

    const existing = await loadActivity(db, input.teamId, input.activityId);

    if (
      input.activityTypeId !== undefined &&
      input.activityTypeId !== existing.activity_type_id
    ) {
      await requireUsableType(db, input.teamId, input.activityTypeId);
    }

    // Validate the merged row: a request may move only the start or only the
    // end, and either can push the pair out of order.
    const startsAt =
      input.startsAt === undefined ? existing.starts_at : new Date(input.startsAt);
    const endsAt =
      input.endsAt === undefined ? existing.ends_at : toDateOrNull(input.endsAt);
    assertEndsAfterStart(startsAt, endsAt);

    const updated = await db
      .updateTable("activities")
      .set({
        ...(input.activityTypeId !== undefined && {
          activity_type_id: input.activityTypeId,
        }),
        ...(input.title !== undefined && { title: input.title }),
        ...(input.startsAt !== undefined && { starts_at: startsAt }),
        ...(input.endsAt !== undefined && { ends_at: endsAt }),
        ...(input.location !== undefined && { location: input.location }),
        ...(input.notes !== undefined && { notes: input.notes }),
        updated_at: new Date(),
      })
      .where("id", "=", input.activityId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { activity: toActivity(updated) };
  }
);

export const setActivityCancelledHandler = os.setActivityCancelled.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "activities.manage");

    await loadActivity(db, input.teamId, input.activityId);

    const updated = await db
      .updateTable("activities")
      .set({ cancelled: input.cancelled, updated_at: new Date() })
      .where("id", "=", input.activityId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { activity: toActivity(updated) };
  }
);
