/**
 * Importing a season of attendance: the dry run (#84). The commit follows in
 * #85 and will go through the same planner, so what the preview promised is by
 * construction what the commit carries out.
 */
import { MAX_IMPORT_MARKS } from "@fc-app/contracts";
import { ORPCError } from "@orpc/server";
import { buildAttendancePlan } from "../attendance/import-plan.js";
import { getDb } from "../db/client.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

export const previewAttendanceImportHandler =
  os.previewAttendanceImport.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(
      db,
      user.id,
      input.teamId,
      "attendance.import"
    );

    // The per-array caps in the schema bound each dimension; their product is
    // what actually has to be held, so it is checked here.
    const marks = input.rows.reduce(
      (total, row) => total + Object.keys(row.marks).length,
      0
    );
    if (marks > MAX_IMPORT_MARKS) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Too many marks: ${marks} (max ${MAX_IMPORT_MARKS})`,
      });
    }

    const plan = await buildAttendancePlan(db, input);
    return {
      activities: plan.activities,
      rows: plan.rows,
      summary: plan.summary,
      newActivityTypes: plan.newActivityTypes,
    };
  });
