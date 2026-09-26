/** Match levels — call-up templates (ADR-028). Archived, never deleted (ADR-014). */
import { ORPCError } from "@orpc/server";
import type { Kysely, Selectable } from "kysely";
import {
  validateCallupSlots,
  type CallupSlot,
  type CallupTemplate,
} from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { CallupTemplatesTable, Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

function toTemplate(row: Selectable<CallupTemplatesTable>): CallupTemplate {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    levelMetricId: row.level_metric_id,
    minAttendanceRate: row.min_attendance_rate,
    attendanceActivityTypeId: row.attendance_activity_type_id,
    slots: row.slots,
    minCoachChildren: row.min_coach_children,
    sortOrder: row.sort_order,
    archived: row.archived,
  };
}

async function loadTemplate(
  db: Kysely<Database>,
  teamId: string,
  templateId: string
): Promise<Selectable<CallupTemplatesTable>> {
  const row = await db
    .selectFrom("callup_templates")
    .selectAll()
    .where("id", "=", templateId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Match level not found" });
  }
  return row;
}

/**
 * The level metric must be one of this team's scales: the slots name its
 * steps, and a number or text metric has no steps to name.
 */
async function requireLevelScale(
  db: Kysely<Database>,
  teamId: string,
  metricId: string
): Promise<{ scaleMin: number; scaleMax: number }> {
  const metric = await db
    .selectFrom("development_metrics")
    .select(["value_type", "scale_min", "scale_max"])
    .where("id", "=", metricId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!metric) {
    throw new ORPCError("NOT_FOUND", { message: "Metric not found" });
  }
  if (
    metric.value_type !== "scale" ||
    metric.scale_min === null ||
    metric.scale_max === null
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A match level is read off a scale metric",
    });
  }
  return { scaleMin: metric.scale_min, scaleMax: metric.scale_max };
}

function assertSlots(
  slots: CallupSlot[],
  scale: { scaleMin: number; scaleMax: number }
): void {
  const result = validateCallupSlots(slots, scale);
  if (!result.ok) {
    throw new ORPCError("BAD_REQUEST", { message: result.error });
  }
}

async function requireActivityType(
  db: Kysely<Database>,
  teamId: string,
  activityTypeId: string
): Promise<void> {
  const type = await db
    .selectFrom("activity_types")
    .select("id")
    .where("id", "=", activityTypeId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!type) {
    throw new ORPCError("NOT_FOUND", { message: "Activity type not found" });
  }
}

/** Rejects a name already used by another *active* template in the team. */
async function assertNameAvailable(
  db: Kysely<Database>,
  teamId: string,
  name: string,
  excludeId?: string
): Promise<void> {
  let query = db
    .selectFrom("callup_templates")
    .select("id")
    .where("team_id", "=", teamId)
    .where("name", "=", name)
    .where("archived", "=", false);
  if (excludeId !== undefined) {
    query = query.where("id", "!=", excludeId);
  }
  if (await query.executeTakeFirst()) {
    throw new ORPCError("BAD_REQUEST", {
      message: `There is already a match level called ${name}`,
    });
  }
}

export const listCallupTemplatesHandler = os.listCallupTemplates.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    // The call-up screen names the levels, so reading them is as open as the
    // squad itself; only settings.team may change them.
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    let query = db
      .selectFrom("callup_templates")
      .selectAll()
      .where("team_id", "=", input.teamId);
    if (input.includeArchived !== true) {
      query = query.where("archived", "=", false);
    }
    const rows = await query.orderBy("sort_order").orderBy("name").execute();
    return { templates: rows.map(toTemplate) };
  }
);

export const createCallupTemplateHandler = os.createCallupTemplate.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    const scale = await requireLevelScale(db, input.teamId, input.levelMetricId);
    assertSlots(input.slots, scale);
    if (input.attendanceActivityTypeId) {
      await requireActivityType(db, input.teamId, input.attendanceActivityTypeId);
    }
    await assertNameAvailable(db, input.teamId, input.name);

    const max = await db
      .selectFrom("callup_templates")
      .select((eb) => eb.fn.max("sort_order").as("max"))
      .where("team_id", "=", input.teamId)
      .executeTakeFirst();

    const inserted = await db
      .insertInto("callup_templates")
      .values({
        team_id: input.teamId,
        name: input.name,
        level_metric_id: input.levelMetricId,
        min_attendance_rate: input.minAttendanceRate ?? null,
        attendance_activity_type_id: input.attendanceActivityTypeId ?? null,
        slots: JSON.stringify(input.slots),
        min_coach_children: input.minCoachChildren ?? 0,
        sort_order: (max?.max ?? -1) + 1,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { template: toTemplate(inserted) };
  }
);

export const updateCallupTemplateHandler = os.updateCallupTemplate.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    const existing = await loadTemplate(db, input.teamId, input.templateId);

    const updates: Record<string, unknown> = {};
    if (input.name !== undefined && input.name !== existing.name) {
      await assertNameAvailable(db, input.teamId, input.name, existing.id);
      updates["name"] = input.name;
    }

    // A new metric or new slots are checked together: slots valid on the old
    // scale may name steps the new one does not have.
    if (input.levelMetricId !== undefined || input.slots !== undefined) {
      const metricId = input.levelMetricId ?? existing.level_metric_id;
      const scale = await requireLevelScale(db, input.teamId, metricId);
      assertSlots(input.slots ?? existing.slots, scale);
      updates["level_metric_id"] = metricId;
      if (input.slots !== undefined) {
        updates["slots"] = JSON.stringify(input.slots);
      }
    }

    if (input.minAttendanceRate !== undefined) {
      updates["min_attendance_rate"] = input.minAttendanceRate;
    }
    if (input.attendanceActivityTypeId !== undefined) {
      if (input.attendanceActivityTypeId !== null) {
        await requireActivityType(
          db,
          input.teamId,
          input.attendanceActivityTypeId
        );
      }
      updates["attendance_activity_type_id"] = input.attendanceActivityTypeId;
    }
    if (input.minCoachChildren !== undefined) {
      updates["min_coach_children"] = input.minCoachChildren;
    }
    if (input.sortOrder !== undefined) updates["sort_order"] = input.sortOrder;

    if (Object.keys(updates).length === 0) {
      return { template: toTemplate(existing) };
    }

    const updated = await db
      .updateTable("callup_templates")
      .set(updates)
      .where("id", "=", existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { template: toTemplate(updated) };
  }
);

export const archiveCallupTemplateHandler = os.archiveCallupTemplate.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    const existing = await loadTemplate(db, input.teamId, input.templateId);
    if (!input.archived && existing.archived) {
      await assertNameAvailable(db, input.teamId, existing.name, existing.id);
    }

    // Archiving hides the level from new call-ups; matches already booked at
    // it keep pointing here, so rotation still counts them (ADR-014).
    const updated = await db
      .updateTable("callup_templates")
      .set({ archived: input.archived })
      .where("id", "=", existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { template: toTemplate(updated) };
  }
);

export { loadTemplate, requireLevelScale, assertSlots };
