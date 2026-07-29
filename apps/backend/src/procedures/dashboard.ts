import type { Kysely } from "kysely";
import {
  isAtRisk,
  type ActivityColour,
  type DashboardActivity,
  type DashboardAttendance,
} from "@fc-app/contracts";
import { summariseAttendance } from "../attendance/summarise.js";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamAccess } from "../tenancy/membership.js";
import { loadMyCallups } from "./callup-responses.js";

/**
 * Dashboard (issue #20) — the landing page inside a team context.
 *
 * One procedure, not four. The page shows four features that each have their
 * own page already, and asking for them separately would mean four round trips
 * that each re-resolve the caller's membership before doing any work.
 *
 * Access is `requireTeamAccess`, deliberately weaker than the `members.view`
 * the widgets need: everyone in the team gets a dashboard, and what is *on* it
 * is decided per widget below. A player is not shown an empty coach's page,
 * and a coach is not denied one because a widget needs a permission they lack.
 * Each widget the caller may not see comes back as null; empty is a different
 * answer, and means "you may see this, and there is nothing here yet".
 */

/** How many activities the "what's next" widget carries. */
const UPCOMING_LIMIT = 5;

/** The window the attendance trend is measured over, twice. */
const ATTENDANCE_WINDOW_DAYS = 30;

function daysBefore(from: Date, days: number): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * The next few activities, with their type resolved and their squad tallied.
 *
 * Cancelled activities are included. They stay on the calendar struck through
 * so nobody turns up at the pitch, and the dashboard is exactly where someone
 * checking "what's on tonight" would look.
 */
async function loadUpcoming(
  db: Kysely<Database>,
  teamId: string
): Promise<DashboardActivity[]> {
  const rows = await db
    .selectFrom("activities")
    .innerJoin(
      "activity_types",
      "activity_types.id",
      "activities.activity_type_id"
    )
    .select([
      "activities.id as id",
      "activities.starts_at as starts_at",
      "activities.ends_at as ends_at",
      "activities.title as title",
      "activities.location as location",
      "activities.cancelled as cancelled",
      "activities.activity_type_id as activity_type_id",
      "activity_types.name as type_name",
      "activity_types.colour as type_colour",
    ])
    .where("activities.team_id", "=", teamId)
    .where("activities.starts_at", ">=", new Date())
    .orderBy("activities.starts_at")
    .limit(UPCOMING_LIMIT)
    .execute();

  if (rows.length === 0) return [];

  // One query for every tally, rather than one per activity.
  const tallies = await db
    .selectFrom("callup_invitations")
    .innerJoin("callups", "callups.id", "callup_invitations.callup_id")
    .select(["callups.activity_id as activity_id", "callup_invitations.response"])
    .where(
      "callups.activity_id",
      "in",
      rows.map((row) => row.id)
    )
    // A draft squad is nobody's to answer yet, so it has no tally to show.
    .where("callups.published", "=", true)
    .execute();

  const counted = new Map<string, Record<string, number>>();
  for (const tally of tallies) {
    const forActivity = counted.get(tally.activity_id) ?? {};
    forActivity[tally.response] = (forActivity[tally.response] ?? 0) + 1;
    counted.set(tally.activity_id, forActivity);
  }

  return rows.map((row) => {
    const counts = counted.get(row.id);
    const accepted = counts?.["accepted"] ?? 0;
    const declined = counts?.["declined"] ?? 0;
    const pending = counts?.["pending"] ?? 0;
    return {
      id: row.id,
      startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at?.toISOString() ?? null,
      title: row.title,
      location: row.location,
      cancelled: row.cancelled,
      activityTypeId: row.activity_type_id,
      activityTypeName: row.type_name,
      activityTypeColour: row.type_colour as ActivityColour,
      callup:
        counts === undefined
          ? null
          : { squad: accepted + declined + pending, accepted, declined, pending },
    };
  });
}

/** Unanswered invitations across the team's published, upcoming squads. */
async function countPendingCallups(
  db: Kysely<Database>,
  teamId: string
): Promise<number> {
  const row = await db
    .selectFrom("callup_invitations")
    .innerJoin("callups", "callups.id", "callup_invitations.callup_id")
    .innerJoin("activities", "activities.id", "callups.activity_id")
    .select((eb) => eb.fn.countAll<string>().as("pending"))
    .where("activities.team_id", "=", teamId)
    .where("callups.published", "=", true)
    .where("activities.cancelled", "=", false)
    .where("activities.starts_at", ">=", new Date())
    .where("callup_invitations.response", "=", "pending")
    .executeTakeFirst();

  return Number(row?.pending ?? 0);
}

/**
 * The attendance trend: this window's rate and the one before it.
 *
 * Both windows are summarised with the same pure function the statistics page
 * (#15) uses, so the dashboard's percentage is the one the page it links to
 * will show — the rate is attended ÷ marked, and an unmarked session stays
 * unknown rather than counting as an absence.
 */
async function loadAttendance(
  db: Kysely<Database>,
  teamId: string
): Promise<DashboardAttendance> {
  const now = new Date();
  const windowStart = daysBefore(now, ATTENDANCE_WINDOW_DAYS);
  const previousStart = daysBefore(now, ATTENDANCE_WINDOW_DAYS * 2);

  const [statuses, members, activities] = await Promise.all([
    db
      .selectFrom("attendance_statuses")
      .select("id")
      .where("team_id", "=", teamId)
      // Archived statuses still count: a record made under "Late" before it
      // was retired was a presence then and stays one now.
      .where("counts_as_present", "=", true)
      .execute(),
    db
      .selectFrom("members")
      .select(["id", "first_name", "last_name"])
      .where("team_id", "=", teamId)
      .where("archived", "=", false)
      .execute(),
    // Both windows in one query, partitioned below — a called-off training is
    // not a session anyone failed to attend, so cancelled ones are excluded.
    db
      .selectFrom("activities")
      .select(["id", "starts_at"])
      .where("team_id", "=", teamId)
      .where("cancelled", "=", false)
      .where("starts_at", ">=", previousStart)
      .where("starts_at", "<", now)
      .execute(),
  ]);

  const presentStatusIds = new Set(statuses.map((status) => status.id));
  const current: string[] = [];
  const previous: string[] = [];
  for (const activity of activities) {
    if (activity.starts_at >= windowStart) current.push(activity.id);
    else previous.push(activity.id);
  }

  const memberIds = members.map((member) => member.id);
  const records =
    activities.length === 0 || memberIds.length === 0
      ? []
      : await db
          .selectFrom("attendance_records")
          .select(["activity_id", "member_id", "status_id"])
          .where(
            "activity_id",
            "in",
            activities.map((activity) => activity.id)
          )
          .where("member_id", "in", memberIds)
          .execute();

  const currentIds = new Set(current);
  const summary = summariseAttendance({
    members,
    records: records.filter((record) => currentIds.has(record.activity_id)),
    presentStatusIds,
    activities: current.length,
  });
  const before = summariseAttendance({
    members,
    records: records.filter((record) => !currentIds.has(record.activity_id)),
    presentStatusIds,
    activities: previous.length,
  });

  return {
    windowDays: ATTENDANCE_WINDOW_DAYS,
    rate: summary.teamRate,
    previousRate: before.teamRate,
    activities: summary.activities,
    marked: summary.members.reduce((sum, member) => sum + member.marked, 0),
    atRisk: summary.members.filter(isAtRisk).length,
  };
}

export const dashboardHandler = os.dashboard.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const access = await requireTeamAccess(db, user.id, input.teamId);
    const canView = access.membership.permissions.includes("members.view");

    // Every widget at once. This is the "single round of queries" the issue
    // asks for: nothing here waits on anything else's result.
    const [myPendingCallups, upcoming, callupsPending, attendance] =
      await Promise.all([
        loadMyCallups(db, user.id, {
          teamId: input.teamId,
          pendingOnly: true,
        }),
        canView ? loadUpcoming(db, input.teamId) : null,
        canView ? countPendingCallups(db, input.teamId) : null,
        canView ? loadAttendance(db, input.teamId) : null,
      ]);

    return { myPendingCallups, upcoming, callupsPending, attendance };
  }
);
