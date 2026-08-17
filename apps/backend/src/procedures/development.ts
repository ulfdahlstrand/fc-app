/** Player development: metric definitions, and dated assessments (ADR-014, ADR-019). */
import { ORPCError } from "@orpc/server";
import type { Kysely, Selectable } from "kysely";
import {
  metricValueColumn,
  validateDevelopmentValue,
  validateMetricDefinition,
  type DevelopmentAssessment,
  type DevelopmentMetric,
  type DevelopmentValue,
  type DevelopmentValueType,
} from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database, DevelopmentMetricsTable } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import {
  requireAnyTeamPermission,
  requireTeamPermission,
} from "../tenancy/membership.js";

function toMetric(
  row: Selectable<DevelopmentMetricsTable>
): DevelopmentMetric {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    valueType: row.value_type as DevelopmentValueType,
    unit: row.unit,
    scaleMin: row.scale_min,
    scaleMax: row.scale_max,
    higherIsBetter: row.higher_is_better,
    sortOrder: row.sort_order,
    archived: row.archived,
  };
}

interface ValueRow {
  metric_id: string;
  value_number: string | null;
  value_text: string | null;
}

/** `numeric` arrives as a string; this is the only place it becomes a number. */
function toValue(row: ValueRow): DevelopmentValue {
  return {
    metricId: row.metric_id,
    number: row.value_number === null ? null : Number(row.value_number),
    text: row.value_text,
  };
}

async function loadMetric(
  db: Kysely<Database>,
  teamId: string,
  metricId: string
): Promise<Selectable<DevelopmentMetricsTable>> {
  const row = await db
    .selectFrom("development_metrics")
    .selectAll()
    .where("id", "=", metricId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Metric not found" });
  }
  return row;
}

/**
 * The member, confirmed to be in this team. A member id alone must never be a
 * route into another team's roster (ADR-003) — the same guard `setTrackingEntry`
 * applies.
 */
async function requireTeamMember(
  db: Kysely<Database>,
  teamId: string,
  memberId: string
): Promise<void> {
  const member = await db
    .selectFrom("members")
    .select("id")
    .where("id", "=", memberId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!member) {
    throw new ORPCError("NOT_FOUND", { message: "Member not found" });
  }
}

/** Turns the partial unique index into a sentence a coach can act on. */
async function assertNameAvailable(
  db: Kysely<Database>,
  teamId: string,
  name: string,
  exceptId?: string
): Promise<void> {
  let query = db
    .selectFrom("development_metrics")
    .select("id")
    .where("team_id", "=", teamId)
    .where("name", "=", name)
    .where("archived", "=", false);
  if (exceptId !== undefined) {
    query = query.where("id", "!=", exceptId);
  }
  const clash = await query.executeTakeFirst();
  if (clash) {
    throw new ORPCError("BAD_REQUEST", {
      message: `There is already a metric called ${name}`,
    });
  }
}

/** One assessment with its values and the name of whoever recorded it. */
async function readAssessments(
  db: Kysely<Database>,
  memberIds: string[],
  assessmentId?: string
): Promise<DevelopmentAssessment[]> {
  let query = db
    .selectFrom("development_assessments")
    // Left join: the record outlives the account that made it.
    .leftJoin("users", "users.id", "development_assessments.created_by")
    .select([
      "development_assessments.id as id",
      "development_assessments.member_id as member_id",
      "development_assessments.assessed_on as assessed_on",
      "development_assessments.note as note",
      "development_assessments.created_by as created_by",
      "development_assessments.created_at as created_at",
      "users.name as created_by_name",
    ])
    .where("development_assessments.member_id", "in", memberIds);
  if (assessmentId !== undefined) {
    query = query.where("development_assessments.id", "=", assessmentId);
  }

  const rows = await query
    .orderBy("development_assessments.assessed_on", "desc")
    .execute();
  if (rows.length === 0) return [];

  const values = await db
    .selectFrom("development_values")
    .select(["assessment_id", "metric_id", "value_number", "value_text"])
    .where(
      "assessment_id",
      "in",
      rows.map((row) => row.id)
    )
    .execute();

  const byAssessment = new Map<string, DevelopmentValue[]>();
  for (const value of values) {
    const list = byAssessment.get(value.assessment_id) ?? [];
    list.push(toValue(value));
    byAssessment.set(value.assessment_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    memberId: row.member_id,
    assessedOn: row.assessed_on,
    note: row.note,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at.toISOString(),
    values: byAssessment.get(row.id) ?? [],
  }));
}

export const listDevelopmentMetricsHandler = os.listDevelopmentMetrics.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    // Two authorities answer "what does this team measure?" — whoever records
    // an assessment, and whoever configures the list (ADR-011).
    await requireAnyTeamPermission(db, user.id, input.teamId, [
      "development.manage",
      "settings.team",
    ]);

    let query = db
      .selectFrom("development_metrics")
      .selectAll()
      .where("team_id", "=", input.teamId);
    if (input.includeArchived !== true) {
      query = query.where("archived", "=", false);
    }
    const rows = await query.orderBy("sort_order").orderBy("name").execute();
    return { metrics: rows.map(toMetric) };
  }
);

export const createDevelopmentMetricHandler =
  os.createDevelopmentMetric.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    const shape = validateMetricDefinition(input);
    if (!shape.ok) {
      throw new ORPCError("BAD_REQUEST", { message: shape.error });
    }
    await assertNameAvailable(db, input.teamId, input.name);

    // Append to the end of the current ordering — a new metric belongs at the
    // bottom of the form, not silently in the middle of it.
    const max = await db
      .selectFrom("development_metrics")
      .select((eb) => eb.fn.max("sort_order").as("max"))
      .where("team_id", "=", input.teamId)
      .executeTakeFirst();

    const inserted = await db
      .insertInto("development_metrics")
      .values({
        team_id: input.teamId,
        name: input.name,
        value_type: input.valueType,
        unit: input.unit ?? null,
        scale_min: input.scaleMin ?? null,
        scale_max: input.scaleMax ?? null,
        higher_is_better: input.higherIsBetter ?? true,
        sort_order: (max?.max ?? -1) + 1,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { metric: toMetric(inserted) };
  });

export const updateDevelopmentMetricHandler =
  os.updateDevelopmentMetric.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    const existing = await loadMetric(db, input.teamId, input.metricId);

    if (input.unit !== undefined) {
      const shape = validateMetricDefinition({
        valueType: existing.value_type as DevelopmentValueType,
        unit: input.unit,
        scaleMin: existing.scale_min,
        scaleMax: existing.scale_max,
      });
      if (!shape.ok) {
        throw new ORPCError("BAD_REQUEST", { message: shape.error });
      }
    }

    if (input.name !== undefined && input.name !== existing.name) {
      await assertNameAvailable(db, input.teamId, input.name, input.metricId);
    }

    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates["name"] = input.name;
    if (input.unit !== undefined) updates["unit"] = input.unit;
    if (input.higherIsBetter !== undefined) {
      updates["higher_is_better"] = input.higherIsBetter;
    }
    if (input.sortOrder !== undefined) updates["sort_order"] = input.sortOrder;
    if (Object.keys(updates).length === 0) {
      return { metric: toMetric(existing) };
    }

    const updated = await db
      .updateTable("development_metrics")
      .set(updates)
      .where("id", "=", input.metricId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { metric: toMetric(updated) };
  });

export const archiveDevelopmentMetricHandler =
  os.archiveDevelopmentMetric.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    const existing = await loadMetric(db, input.teamId, input.metricId);

    // Bringing one back has to re-check the name: another metric may have taken
    // it while this one was retired.
    if (!input.archived && existing.archived) {
      await assertNameAvailable(db, input.teamId, existing.name, input.metricId);
    }

    const updated = await db
      .updateTable("development_metrics")
      .set({ archived: input.archived })
      .where("id", "=", input.metricId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { metric: toMetric(updated) };
  });

export const memberDevelopmentHandler = os.memberDevelopment.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(
      db,
      user.id,
      input.teamId,
      "development.manage"
    );
    await requireTeamMember(db, input.teamId, input.memberId);

    // Archived metrics come along: an assessment from March still has to be
    // able to say what it measured (ADR-014).
    const [metrics, assessments] = await Promise.all([
      db
        .selectFrom("development_metrics")
        .selectAll()
        .where("team_id", "=", input.teamId)
        .orderBy("sort_order")
        .orderBy("name")
        .execute(),
      readAssessments(db, [input.memberId]),
    ]);

    return { metrics: metrics.map(toMetric), assessments };
  }
);

export const saveDevelopmentAssessmentHandler =
  os.saveDevelopmentAssessment.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(
      db,
      user.id,
      input.teamId,
      "development.manage"
    );
    await requireTeamMember(db, input.teamId, input.memberId);

    const metrics = await db
      .selectFrom("development_metrics")
      .selectAll()
      .where("team_id", "=", input.teamId)
      .execute();
    const byId = new Map(metrics.map((metric) => [metric.id, metric]));

    // Reject the whole write before touching anything if any metric is foreign:
    // half a saved assessment is worse than a refused one.
    for (const value of input.values) {
      if (!byId.has(value.metricId)) {
        throw new ORPCError("NOT_FOUND", { message: "Metric not found" });
      }
    }

    const now = new Date();
    const assessmentId = await db.transaction().execute(async (trx) => {
      const assessment = await trx
        .insertInto("development_assessments")
        .values({
          member_id: input.memberId,
          assessed_on: input.assessedOn,
          note: input.note ?? null,
          created_by: user.id,
          updated_at: now,
        })
        // Saving the same member and day again edits that assessment rather
        // than adding a second one. `created_by` is left alone: it records who
        // made the assessment, not who last touched the row.
        .onConflict((oc) =>
          oc.columns(["member_id", "assessed_on"]).doUpdateSet({
            note: input.note ?? null,
            updated_at: now,
          })
        )
        .returning("id")
        .executeTakeFirstOrThrow();

      const existing = await trx
        .selectFrom("development_values")
        .select("metric_id")
        .where("assessment_id", "=", assessment.id)
        .execute();
      const alreadyRecorded = new Set(existing.map((row) => row.metric_id));

      for (const value of input.values) {
        const metric = byId.get(value.metricId);
        if (!metric) continue;

        if (value.value === null || value.value.trim() === "") {
          await trx
            .deleteFrom("development_values")
            .where("assessment_id", "=", assessment.id)
            .where("metric_id", "=", value.metricId)
            .execute();
          continue;
        }

        // A retired metric stops being asked about, but a value already
        // recorded against it stays editable — otherwise re-saving an old
        // assessment would fail on a column nobody can change any more.
        if (metric.archived && !alreadyRecorded.has(metric.id)) {
          throw new ORPCError("BAD_REQUEST", {
            message: `${metric.name} has been archived`,
          });
        }

        const validation = validateDevelopmentValue(
          {
            valueType: metric.value_type as DevelopmentValueType,
            scaleMin: metric.scale_min,
            scaleMax: metric.scale_max,
          },
          value.value
        );
        if (!validation.ok) {
          throw new ORPCError("BAD_REQUEST", {
            message: `${metric.name}: ${validation.error}`,
          });
        }

        // Which column a type lands in is decided in one place, and the
        // CHECK constraint is the database agreeing.
        const column = metricValueColumn(
          metric.value_type as DevelopmentValueType
        );
        const row = {
          assessment_id: assessment.id,
          metric_id: value.metricId,
          value_number: column === "number" ? validation.number : null,
          value_text: column === "text" ? validation.text : null,
        };

        await trx
          .insertInto("development_values")
          .values(row)
          .onConflict((oc) =>
            oc.columns(["assessment_id", "metric_id"]).doUpdateSet({
              value_number: row.value_number,
              value_text: row.value_text,
            })
          )
          .execute();
      }

      return assessment.id;
    });

    const [assessment] = await readAssessments(
      db,
      [input.memberId],
      assessmentId
    );
    if (!assessment) {
      throw new ORPCError("NOT_FOUND", { message: "Assessment not found" });
    }
    return { assessment };
  });

export const deleteDevelopmentAssessmentHandler =
  os.deleteDevelopmentAssessment.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(
      db,
      user.id,
      input.teamId,
      "development.manage"
    );

    // Scoped through the member's team: an assessment id from another club must
    // look like it does not exist, not like something withheld.
    const assessment = await db
      .selectFrom("development_assessments")
      .innerJoin("members", "members.id", "development_assessments.member_id")
      .select("development_assessments.id as id")
      .where("development_assessments.id", "=", input.assessmentId)
      .where("members.team_id", "=", input.teamId)
      .executeTakeFirst();
    if (!assessment) {
      throw new ORPCError("NOT_FOUND", { message: "Assessment not found" });
    }

    // A genuine delete, unlike the cancel an activity gets (ADR-014). Nobody
    // turns up anywhere because of an assessment; one recorded against the
    // wrong player left in place would misinform the next coach instead.
    await db
      .deleteFrom("development_assessments")
      .where("id", "=", input.assessmentId)
      .execute();
    return { deleted: true };
  });
