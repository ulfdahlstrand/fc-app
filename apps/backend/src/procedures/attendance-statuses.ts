import { ORPCError } from "@orpc/server";
import type { Kysely, Selectable } from "kysely";
import type { ActivityColour, AttendanceStatus } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { AttendanceStatusesTable, Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

/**
 * Attendance statuses (issue #14, ADR-005) — team configuration, not code.
 *
 * Mirrors activity types (#11): reading needs `members.view` (whoever records
 * or reads attendance needs the labels), managing needs `settings.team`.
 * Statuses are archived, never deleted, so records keep naming their status.
 */
function toAttendanceStatus(
  row: Selectable<AttendanceStatusesTable>
): AttendanceStatus {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    colour: row.colour as ActivityColour,
    countsAsPresent: row.counts_as_present,
    sortOrder: row.sort_order,
    archived: row.archived,
  };
}

async function loadStatus(
  db: Kysely<Database>,
  teamId: string,
  statusId: string
): Promise<Selectable<AttendanceStatusesTable>> {
  const row = await db
    .selectFrom("attendance_statuses")
    .selectAll()
    .where("id", "=", statusId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Attendance status not found" });
  }
  return row;
}

/**
 * Rejects a name already used by another *active* status in the same team.
 * The partial unique index enforces this in the database as well; this turns
 * the constraint violation into a readable message.
 */
async function assertNameAvailable(
  db: Kysely<Database>,
  teamId: string,
  name: string,
  excludeId?: string
): Promise<void> {
  let query = db
    .selectFrom("attendance_statuses")
    .select("id")
    .where("team_id", "=", teamId)
    .where("name", "=", name)
    .where("archived", "=", false);
  if (excludeId !== undefined) {
    query = query.where("id", "!=", excludeId);
  }
  if (await query.executeTakeFirst()) {
    throw new ORPCError("BAD_REQUEST", {
      message: `There is already a status called ${name}`,
    });
  }
}

export const listAttendanceStatusesHandler = os.listAttendanceStatuses.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    let query = db
      .selectFrom("attendance_statuses")
      .selectAll()
      .where("team_id", "=", input.teamId);
    if (input.includeArchived !== true) {
      query = query.where("archived", "=", false);
    }
    // Sort order is the order a coach taps through at the pitch side.
    const rows = await query.orderBy("sort_order").orderBy("name").execute();
    return { attendanceStatuses: rows.map(toAttendanceStatus) };
  }
);

export const createAttendanceStatusHandler =
  os.createAttendanceStatus.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    await assertNameAvailable(db, input.teamId, input.name);

    // Append to the end of the current ordering.
    const max = await db
      .selectFrom("attendance_statuses")
      .select((eb) => eb.fn.max("sort_order").as("max"))
      .where("team_id", "=", input.teamId)
      .executeTakeFirst();

    const inserted = await db
      .insertInto("attendance_statuses")
      .values({
        team_id: input.teamId,
        name: input.name,
        colour: input.colour ?? "neutral",
        counts_as_present: input.countsAsPresent ?? false,
        sort_order: (max?.max ?? -1) + 1,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { attendanceStatus: toAttendanceStatus(inserted) };
  });

export const updateAttendanceStatusHandler =
  os.updateAttendanceStatus.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    const existing = await loadStatus(
      db,
      input.teamId,
      input.attendanceStatusId
    );

    const updates: Record<string, unknown> = {};
    if (input.name !== undefined && input.name !== existing.name) {
      await assertNameAvailable(
        db,
        input.teamId,
        input.name,
        input.attendanceStatusId
      );
      updates["name"] = input.name;
    }
    if (input.colour !== undefined) updates["colour"] = input.colour;
    if (input.countsAsPresent !== undefined) {
      updates["counts_as_present"] = input.countsAsPresent;
    }
    if (input.sortOrder !== undefined) updates["sort_order"] = input.sortOrder;

    if (Object.keys(updates).length === 0) {
      return { attendanceStatus: toAttendanceStatus(existing) };
    }

    const updated = await db
      .updateTable("attendance_statuses")
      .set(updates)
      .where("id", "=", input.attendanceStatusId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { attendanceStatus: toAttendanceStatus(updated) };
  });

export const archiveAttendanceStatusHandler =
  os.archiveAttendanceStatus.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    const existing = await loadStatus(
      db,
      input.teamId,
      input.attendanceStatusId
    );

    // Un-archiving can collide with a status created under the same name while
    // this one was retired.
    if (!input.archived && existing.archived) {
      await assertNameAvailable(
        db,
        input.teamId,
        existing.name,
        input.attendanceStatusId
      );
    }

    const updated = await db
      .updateTable("attendance_statuses")
      .set({ archived: input.archived })
      .where("id", "=", input.attendanceStatusId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { attendanceStatus: toAttendanceStatus(updated) };
  });
