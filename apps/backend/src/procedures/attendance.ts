import { ORPCError } from "@orpc/server";
import type { Kysely, Selectable } from "kysely";
import type { AttendanceRecord } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { AttendanceRecordsTable, Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

/**
 * Attendance records (issue #14).
 *
 * Reading needs `members.view`; recording needs `attendance.record`.
 *
 * Writing is a bulk operation. The coach stands at the side of the pitch,
 * marks the roster and saves once — one request, one transaction — rather
 * than firing a mutation per tap on a connection that may not be there.
 */
function toRecord(row: Selectable<AttendanceRecordsTable>): AttendanceRecord {
  return {
    activityId: row.activity_id,
    memberId: row.member_id,
    statusId: row.status_id,
    note: row.note,
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

export const listAttendanceHandler = os.listAttendance.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    await requireActivity(db, input.teamId, input.activityId);

    const rows = await db
      .selectFrom("attendance_records")
      .selectAll()
      .where("activity_id", "=", input.activityId)
      .execute();
    return { records: rows.map(toRecord) };
  }
);

export const setAttendanceHandler = os.setAttendance.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "attendance.record");

    await requireActivity(db, input.teamId, input.activityId);

    const memberIds = input.entries.map((entry) => entry.memberId);
    const statusIds = input.entries
      .map((entry) => entry.statusId)
      .filter((id): id is string => id !== null);

    // Both sets are checked against *this* team, so a request cannot reach
    // across the tenant boundary by guessing ids (ADR-003).
    if (memberIds.length > 0) {
      const members = await db
        .selectFrom("members")
        .select("id")
        .where("id", "in", memberIds)
        .where("team_id", "=", input.teamId)
        .execute();
      if (members.length !== new Set(memberIds).size) {
        throw new ORPCError("NOT_FOUND", {
          message: "One of those members is not in this team",
        });
      }
    }
    if (statusIds.length > 0) {
      const statuses = await db
        .selectFrom("attendance_statuses")
        .select("id")
        .where("id", "in", statusIds)
        .where("team_id", "=", input.teamId)
        .execute();
      if (statuses.length !== new Set(statusIds).size) {
        throw new ORPCError("NOT_FOUND", {
          message: "One of those statuses is not in this team",
        });
      }
    }

    const cleared = input.entries
      .filter((entry) => entry.statusId === null)
      .map((entry) => entry.memberId);
    const marked = input.entries.filter(
      (entry): entry is { memberId: string; statusId: string; note?: string | null } =>
        entry.statusId !== null
    );

    // One transaction: a half-saved roster is worse than an unsaved one — the
    // coach would have no way to tell which half made it.
    await db.transaction().execute(async (trx) => {
      if (cleared.length > 0) {
        // Clearing a mark deletes the row: an unmarked member is the absence
        // of a record, not a status meaning "unknown".
        await trx
          .deleteFrom("attendance_records")
          .where("activity_id", "=", input.activityId)
          .where("member_id", "in", cleared)
          .execute();
      }

      if (marked.length > 0) {
        await trx
          .insertInto("attendance_records")
          .values(
            marked.map((entry) => ({
              activity_id: input.activityId,
              member_id: entry.memberId,
              status_id: entry.statusId,
              note: entry.note ?? null,
            }))
          )
          .onConflict((oc) =>
            oc.columns(["activity_id", "member_id"]).doUpdateSet((eb) => ({
              status_id: eb.ref("excluded.status_id"),
              note: eb.ref("excluded.note"),
              updated_at: new Date(),
            }))
          )
          .execute();
      }
    });

    // Return the whole activity's attendance, not just what was written: the
    // client renders the roster from it and must not have to merge.
    const rows = await db
      .selectFrom("attendance_records")
      .selectAll()
      .where("activity_id", "=", input.activityId)
      .execute();
    return { records: rows.map(toRecord) };
  }
);
