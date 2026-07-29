import { ORPCError } from "@orpc/server";
import type { Kysely, Selectable } from "kysely";
import type { Activity, ActivitySeries } from "@fc-app/contracts";
import {
  generateOccurrences,
  localTimeOf,
  withLocalTime,
} from "../activities/recurrence.js";
import { seasonRange } from "../activities/season-range.js";
import { getDb } from "../db/client.js";
import type {
  ActivitiesTable,
  ActivitySeriesTable,
  Database,
} from "../db/types.js";
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
    seriesId: row.series_id,
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

    // A season is a date range, not a foreign key (#13): membership is decided
    // by where the activity starts, so a corrected season re-answers it for
    // every activity at once. See `seasonRange` for the boundary caveat.
    if (input.seasonId !== undefined) {
      const range = await seasonRange(db, input.teamId, input.seasonId);
      query = query
        .where("starts_at", ">=", range.from)
        .where("starts_at", "<", range.to);
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

    if (input.scope === "following" && existing.series_id !== null) {
      await applyToFollowing(db, {
        seriesId: existing.series_id,
        teamId: input.teamId,
        after: updated.starts_at,
        input,
        previousStart: existing.starts_at,
        newStart: startsAt,
        newEnd: endsAt,
      });
    }

    return { activity: toActivity(updated) };
  }
);

/**
 * Carries an edit forward through the rest of a series (#13).
 *
 * What travels: the type, title, location and notes, and — if the edit moved
 * the *time of day* — the new start and end times. What does not: the dates.
 * Each later occurrence keeps the day the coach put it on; only the clock
 * changes, which is what "every Tuesday, but from 18:30 now" means. Cancelling
 * stays per-occurrence, so a single called-off training is never resurrected
 * by a later edit.
 *
 * The series template is rewritten too, so the record of "what this series is"
 * matches what its remaining occurrences say.
 */
async function applyToFollowing(
  db: Kysely<Database>,
  args: {
    seriesId: string;
    teamId: string;
    after: Date;
    input: {
      activityTypeId?: string | undefined;
      title?: string | null | undefined;
      location?: string | null | undefined;
      notes?: string | null | undefined;
      startsAt?: string | undefined;
      endsAt?: string | null | undefined;
    };
    previousStart: Date;
    newStart: Date;
    newEnd: Date | null;
  }
): Promise<void> {
  const series = await db
    .selectFrom("activity_series")
    .selectAll()
    .where("id", "=", args.seriesId)
    .where("team_id", "=", args.teamId)
    .executeTakeFirst();
  if (!series) return;

  const zone = series.time_zone;
  const startTime = localTimeOf(args.newStart, zone);
  const endTime = args.newEnd === null ? null : localTimeOf(args.newEnd, zone);
  const timeMoved =
    args.input.startsAt !== undefined &&
    localTimeOf(args.previousStart, zone) !== startTime;
  const endChanged = args.input.endsAt !== undefined;

  const shared = {
    ...(args.input.activityTypeId !== undefined && {
      activity_type_id: args.input.activityTypeId,
    }),
    ...(args.input.title !== undefined && { title: args.input.title }),
    ...(args.input.location !== undefined && { location: args.input.location }),
    ...(args.input.notes !== undefined && { notes: args.input.notes }),
  };

  // The template and the occurrences have to move together, or a failure
  // halfway leaves a series describing something its rows do not do.
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("activity_series")
      .set({
        ...shared,
        ...(timeMoved && { start_time: startTime }),
        ...(endChanged && { end_time: endTime }),
        updated_at: new Date(),
      })
      .where("id", "=", args.seriesId)
      .execute();

    // Nothing time-related changed (a rename, a new location): one statement
    // covers every later occurrence.
    if (!timeMoved && !endChanged) {
      if (Object.keys(shared).length === 0) return;
      await trx
        .updateTable("activities")
        .set({ ...shared, updated_at: new Date() })
        .where("series_id", "=", args.seriesId)
        .where("team_id", "=", args.teamId)
        .where("starts_at", ">", args.after)
        .execute();
      return;
    }

    // A moved time has to be resolved per occurrence: each keeps its own local
    // date, and the offset from UTC may differ across a DST change.
    const later = await trx
      .selectFrom("activities")
      .selectAll()
      .where("series_id", "=", args.seriesId)
      .where("team_id", "=", args.teamId)
      .where("starts_at", ">", args.after)
      .execute();

    for (const occurrence of later) {
      const startsAt = timeMoved
        ? withLocalTime(occurrence.starts_at, startTime, zone)
        : occurrence.starts_at;
      const endsAt = endChanged
        ? endTime === null
          ? null
          : withLocalTime(startsAt, endTime, zone)
        : occurrence.ends_at;

      await trx
        .updateTable("activities")
        .set({
          ...shared,
          ...(timeMoved && { starts_at: startsAt }),
          ...(endChanged && { ends_at: endsAt }),
          updated_at: new Date(),
        })
        .where("id", "=", occurrence.id)
        .execute();
    }
  });
}

export const createRecurringActivitiesHandler =
  os.createRecurringActivities.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "activities.manage");

    await requireUsableType(db, input.teamId, input.activityTypeId);

    const rule = {
      weekdays: input.weekdays,
      startTime: input.startTime,
      endTime: input.endTime ?? null,
      startsOn: input.startsOn,
      until: input.until,
      timeZone: input.timeZone,
    };

    let occurrences;
    try {
      occurrences = generateOccurrences(rule);
    } catch (error) {
      // A range that would bury the calendar, or a zone the server cannot
      // resolve — both are the caller's mistake, not a server fault.
      throw new ORPCError("BAD_REQUEST", {
        message: error instanceof Error ? error.message : "Invalid recurrence",
      });
    }
    if (occurrences.length === 0) {
      throw new ORPCError("BAD_REQUEST", {
        message: "That pattern does not fall on any day in the range",
      });
    }

    // One transaction: a series whose occurrences half-exist is worse than no
    // series at all.
    return await db.transaction().execute(async (trx) => {
      const series = await trx
        .insertInto("activity_series")
        .values({
          team_id: input.teamId,
          activity_type_id: input.activityTypeId,
          title: input.title ?? null,
          location: input.location ?? null,
          notes: input.notes ?? null,
          weekdays: input.weekdays,
          start_time: input.startTime,
          end_time: input.endTime ?? null,
          starts_on: input.startsOn,
          until: input.until,
          time_zone: input.timeZone,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const rows = await trx
        .insertInto("activities")
        .values(
          occurrences.map((occurrence) => ({
            team_id: input.teamId,
            activity_type_id: input.activityTypeId,
            series_id: series.id,
            title: input.title ?? null,
            starts_at: occurrence.startsAt,
            ends_at: occurrence.endsAt,
            location: input.location ?? null,
            notes: input.notes ?? null,
          }))
        )
        .returningAll()
        .execute();

      return {
        series: toActivitySeries(series),
        activities: rows.map(toActivity),
      };
    });
  });

function toActivitySeries(
  row: Selectable<ActivitySeriesTable>
): ActivitySeries {
  return {
    id: row.id,
    teamId: row.team_id,
    activityTypeId: row.activity_type_id,
    title: row.title,
    location: row.location,
    notes: row.notes,
    weekdays: row.weekdays,
    // Postgres hands back "18:00:00"; the contract carries "18:00".
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time === null ? null : row.end_time.slice(0, 5),
    startsOn: row.starts_on,
    until: row.until,
    timeZone: row.time_zone,
  };
}

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
