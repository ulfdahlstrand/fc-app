/**
 * Importing a season of attendance: the dry run (#84) and the commit (#85).
 *
 * Both go through `buildAttendancePlan`, so what the preview promised is by
 * construction what the commit carries out.
 */
import { MAX_IMPORT_MARKS } from "@fc-app/contracts";
import type { previewAttendanceImportInputSchema } from "@fc-app/contracts";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";
import { applyAttendancePlan } from "../attendance/import-apply.js";
import {
  buildAttendancePlan,
  type AttendancePlan,
} from "../attendance/import-plan.js";
import { getDb } from "../db/client.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

type Input = z.infer<typeof previewAttendanceImportInputSchema>;

/**
 * The per-array caps in the schema bound each dimension; their product is
 * what actually has to be held, so it is checked here.
 */
function assertWithinMarkCap(input: Input): void {
  const marks = input.rows.reduce(
    (total, row) => total + Object.keys(row.marks).length,
    0
  );
  if (marks > MAX_IMPORT_MARKS) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Too many marks: ${marks} (max ${MAX_IMPORT_MARKS})`,
    });
  }
}

function toReport(plan: AttendancePlan) {
  return {
    activities: plan.activities,
    rows: plan.rows,
    summary: plan.summary,
    newActivityTypes: plan.newActivityTypes,
  };
}

export const previewAttendanceImportHandler =
  os.previewAttendanceImport.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "attendance.import");
    assertWithinMarkCap(input);

    return toReport(await buildAttendancePlan(db, input));
  });

export const commitAttendanceImportHandler = os.commitAttendanceImport.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "attendance.import");
    assertWithinMarkCap(input);

    // Planned and applied inside one transaction, so the calendar cannot move
    // between the two and a failure half-way leaves nothing behind.
    const plan = await db.transaction().execute(async (trx) => {
      const planned = await buildAttendancePlan(trx, input);
      await applyAttendancePlan(trx, input.teamId, input, planned);
      return planned;
    });

    return toReport(plan);
  }
);
