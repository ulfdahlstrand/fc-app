/** Attendance statistics. The rate is attended ÷ marked (ADR-012). */
import type { Kysely } from "kysely";
import type { MemberAttendanceEntry } from "@fc-app/contracts";
import { seasonRange } from "../activities/season-range.js";
import { rateOf, summariseAttendance } from "../attendance/summarise.js";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";


/** Ids of the in-scope activities: the filters, minus anything cancelled. */
async function selectActivityIds(
  db: Kysely<Database>,
  input: {
    teamId: string;
    from?: string | undefined;
    to?: string | undefined;
    seasonId?: string | undefined;
    activityTypeId?: string | undefined;
  }
): Promise<string[]> {
  let query = db
    .selectFrom("activities")
    .select("id")
    .where("team_id", "=", input.teamId)
    // A called-off training is not a session anyone failed to attend.
    .where("cancelled", "=", false);

  if (input.from !== undefined) {
    query = query.where("starts_at", ">=", new Date(input.from));
  }
  if (input.to !== undefined) {
    query = query.where("starts_at", "<", new Date(input.to));
  }
  if (input.activityTypeId !== undefined) {
    query = query.where("activity_type_id", "=", input.activityTypeId);
  }
  // Season and an explicit range intersect — both narrow, neither replaces.
  if (input.seasonId !== undefined) {
    const range = await seasonRange(db, input.teamId, input.seasonId);
    query = query
      .where("starts_at", ">=", range.from)
      .where("starts_at", "<", range.to);
  }

  const rows = await query.execute();
  return rows.map((row) => row.id);
}

/** The statuses that count towards presence, per this team's configuration. */
async function presentStatusIds(
  db: Kysely<Database>,
  teamId: string
): Promise<Set<string>> {
  const rows = await db
    .selectFrom("attendance_statuses")
    .select("id")
    .where("team_id", "=", teamId)
    // Archived statuses still count: a record made under "Late" before it was
    // retired was a presence then and stays one now.
    .where("counts_as_present", "=", true)
    .execute();
  return new Set(rows.map((row) => row.id));
}

export const attendanceStatsHandler = os.attendanceStats.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    const activityIds = await selectActivityIds(db, input);

    // Archived members are left out: statistics are about the squad you have.
    let memberQuery = db
      .selectFrom("members")
      .select(["id", "first_name", "last_name"])
      .where("team_id", "=", input.teamId)
      .where("archived", "=", false);
    if (input.groupId !== undefined) {
      memberQuery = memberQuery.where(
        "id",
        "in",
        db
          .selectFrom("group_members")
          .select("member_id")
          .where("group_id", "=", input.groupId)
      );
    }
    const members = await memberQuery.execute();

    const memberIds = members.map((member) => member.id);
    const records =
      activityIds.length === 0 || memberIds.length === 0
        ? []
        : await db
            .selectFrom("attendance_records")
            .select(["member_id", "status_id"])
            .where("activity_id", "in", activityIds)
            .where("member_id", "in", memberIds)
            .execute();

    return summariseAttendance({
      members,
      records,
      presentStatusIds: await presentStatusIds(db, input.teamId),
      activities: activityIds.length,
    });
  }
);

const DEFAULT_HISTORY_LIMIT = 50;

export const memberAttendanceHandler = os.memberAttendance.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    const member = await db
      .selectFrom("members")
      .select(["id", "first_name", "last_name"])
      .where("id", "=", input.memberId)
      .where("team_id", "=", input.teamId)
      .executeTakeFirst();
    if (!member) {
      return {
        entries: [],
        stats: {
          memberId: input.memberId,
          firstName: "",
          lastName: "",
          attended: 0,
          marked: 0,
          rate: null,
        },
      };
    }

    // Left join: an activity the member was never marked at still belongs in
    // the history, as a gap rather than an absence.
    const rows = await db
      .selectFrom("activities")
      .leftJoin("attendance_records", (join) =>
        join
          .onRef("attendance_records.activity_id", "=", "activities.id")
          .on("attendance_records.member_id", "=", input.memberId)
      )
      .select([
        "activities.id as activity_id",
        "activities.starts_at as starts_at",
        "activities.title as title",
        "activities.activity_type_id as activity_type_id",
        "attendance_records.status_id as status_id",
      ])
      .where("activities.team_id", "=", input.teamId)
      .where("activities.cancelled", "=", false)
      .orderBy("activities.starts_at", "desc")
      .limit(input.limit ?? DEFAULT_HISTORY_LIMIT)
      .execute();

    const entries: MemberAttendanceEntry[] = rows.map((row) => ({
      activityId: row.activity_id,
      startsAt: row.starts_at.toISOString(),
      title: row.title,
      activityTypeId: row.activity_type_id,
      statusId: row.status_id,
    }));

    // The member's own rate is computed over the window shown, so the numbers
    // on screen always add up to the percentage next to them.
    const present = await presentStatusIds(db, input.teamId);
    const marked = entries.filter((entry) => entry.statusId !== null);
    const attended = marked.filter(
      (entry) => entry.statusId !== null && present.has(entry.statusId)
    );

    return {
      entries,
      stats: {
        memberId: member.id,
        firstName: member.first_name,
        lastName: member.last_name,
        attended: attended.length,
        marked: marked.length,
        rate: rateOf(attended.length, marked.length),
      },
    };
  }
);
