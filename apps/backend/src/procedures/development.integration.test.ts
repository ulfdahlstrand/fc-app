/**
 * Player development, against a real database (#96).
 *
 * Most of what this feature promises is a statement about what Postgres ends up
 * holding: that saving the same day twice updates one assessment rather than
 * growing a second, that clearing a field leaves no row behind, and that the
 * CHECK constraint really does hold exactly one value column. None of those can
 * be answered by a mock, which has no unique constraints and no `ON CONFLICT`.
 *
 * The gate is the other half. `development.manage` exists precisely so that
 * holding `members.view` is not enough to read a coach's assessment of a child,
 * and a test that never asserts the refusal would leave that claim unchecked.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call, ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { closeTestDb, testDb, truncateAll } from "../test/database.js";
import {
  createTestClub,
  createTestMember,
  createTestTeam,
  createTestUser,
  type TestClub,
  type TestUser,
} from "../test/fixtures.js";
import {
  archiveDevelopmentMetricHandler,
  createDevelopmentMetricHandler,
  deleteDevelopmentAssessmentHandler,
  listDevelopmentMetricsHandler,
  memberDevelopmentHandler,
  saveDevelopmentAssessmentHandler,
} from "./development.js";

let db: Kysely<Database>;
let club: TestClub;
let admin: TestUser;
let coach: TestUser;
let teamId: string;
let memberId: string;

/** Creates a metric as the admin and hands back its id. */
async function createMetric(input: {
  name: string;
  valueType: "scale" | "number" | "text" | "boolean";
  unit?: string | null;
  scaleMin?: number | null;
  scaleMax?: number | null;
  higherIsBetter?: boolean;
}): Promise<string> {
  const result = await call(
    createDevelopmentMetricHandler,
    { teamId, ...input },
    { context: admin.context }
  );
  return result.metric.id;
}

beforeEach(async () => {
  db = await testDb();
  await truncateAll();
  club = await createTestClub(db);
  admin = await createTestUser(db, club, { systemKey: "admin" });
  coach = await createTestUser(db, club, {
    systemKey: "coach",
    name: "Karin Tränare",
  });
  teamId = club.teamId;
  memberId = await createTestMember(db, teamId, {
    firstName: "Ture",
    lastName: "Testsson",
  });
});

afterAll(async () => {
  await closeTestDb();
});

describe("metric definitions", () => {
  it("creates a scale and reads it back with its range", async () => {
    await createMetric({
      name: "Nivå",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 5,
    });

    const { metrics } = await call(
      listDevelopmentMetricsHandler,
      { teamId },
      { context: coach.context }
    );
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      name: "Nivå",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 5,
      higherIsBetter: true,
      archived: false,
    });
  });

  it("refuses a scale whose range is inverted", async () => {
    await expect(
      createMetric({
        name: "Trasig",
        valueType: "scale",
        scaleMin: 5,
        scaleMax: 1,
      })
    ).rejects.toThrow(ORPCError);
  });

  it("refuses a second live metric with the same name, but not after archiving", async () => {
    const id = await createMetric({
      name: "Nivå",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 5,
    });
    await expect(
      createMetric({ name: "Nivå", valueType: "text" })
    ).rejects.toThrow(ORPCError);

    await call(
      archiveDevelopmentMetricHandler,
      { teamId, metricId: id, archived: true },
      { context: admin.context }
    );
    await expect(
      createMetric({ name: "Nivå", valueType: "text" })
    ).resolves.toBeDefined();
  });

  it("hides archived metrics unless asked for them", async () => {
    const id = await createMetric({ name: "Coopertest", valueType: "number" });
    await call(
      archiveDevelopmentMetricHandler,
      { teamId, metricId: id, archived: true },
      { context: admin.context }
    );

    const live = await call(
      listDevelopmentMetricsHandler,
      { teamId },
      { context: admin.context }
    );
    expect(live.metrics).toHaveLength(0);

    const all = await call(
      listDevelopmentMetricsHandler,
      { teamId, includeArchived: true },
      { context: admin.context }
    );
    expect(all.metrics).toHaveLength(1);
  });

  it("refuses a metric id belonging to another team", async () => {
    const otherTeam = await createTestTeam(db, club.clubId, "P17");
    const id = await createMetric({
      name: "Nivå",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 5,
    });

    await expect(
      call(
        archiveDevelopmentMetricHandler,
        { teamId: otherTeam, metricId: id, archived: true },
        { context: admin.context }
      )
    ).rejects.toThrow(/not found/i);
  });
});

describe("assessments", () => {
  it("saves a whole occasion in one write and reads it back", async () => {
    const niva = await createMetric({
      name: "Nivå",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 5,
    });
    const sprint = await createMetric({
      name: "30 m sprint",
      valueType: "number",
      unit: "s",
      higherIsBetter: false,
    });
    const note = await createMetric({ name: "Kommentar", valueType: "text" });

    await call(
      saveDevelopmentAssessmentHandler,
      {
        teamId,
        memberId,
        assessedOn: "2026-03-01",
        note: "Efter utvecklingssamtalet",
        values: [
          { metricId: niva, value: "3" },
          { metricId: sprint, value: "4,6" },
          { metricId: note, value: "Stark vänsterfot" },
        ],
      },
      { context: coach.context }
    );

    const result = await call(
      memberDevelopmentHandler,
      { teamId, memberId },
      { context: coach.context }
    );

    expect(result.assessments).toHaveLength(1);
    const assessment = result.assessments[0]!;
    expect(assessment.assessedOn).toBe("2026-03-01");
    expect(assessment.note).toBe("Efter utvecklingssamtalet");
    expect(assessment.createdByName).toBe("Karin Tränare");

    // The decimal comma survived as a number, not as text.
    expect(assessment.values).toContainEqual({
      metricId: sprint,
      number: 4.6,
      text: null,
    });
    expect(assessment.values).toContainEqual({
      metricId: niva,
      number: 3,
      text: null,
    });
    expect(assessment.values).toContainEqual({
      metricId: note,
      number: null,
      text: "Stark vänsterfot",
    });
  });

  it("updates the same day instead of growing a second assessment", async () => {
    const niva = await createMetric({
      name: "Nivå",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 5,
    });

    for (const value of ["3", "4"]) {
      await call(
        saveDevelopmentAssessmentHandler,
        {
          teamId,
          memberId,
          assessedOn: "2026-03-01",
          note: null,
          values: [{ metricId: niva, value }],
        },
        { context: coach.context }
      );
    }

    const { assessments } = await call(
      memberDevelopmentHandler,
      { teamId, memberId },
      { context: coach.context }
    );
    expect(assessments).toHaveLength(1);
    expect(assessments[0]!.values).toEqual([
      { metricId: niva, number: 4, text: null },
    ]);
  });

  it("returns the series newest first", async () => {
    const niva = await createMetric({
      name: "Nivå",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 5,
    });

    for (const [assessedOn, value] of [
      ["2026-03-01", "2"],
      ["2026-05-01", "4"],
      ["2026-04-01", "3"],
    ] as const) {
      await call(
        saveDevelopmentAssessmentHandler,
        {
          teamId,
          memberId,
          assessedOn,
          note: null,
          values: [{ metricId: niva, value }],
        },
        { context: coach.context }
      );
    }

    const { assessments } = await call(
      memberDevelopmentHandler,
      { teamId, memberId },
      { context: coach.context }
    );
    expect(assessments.map((a) => a.assessedOn)).toEqual([
      "2026-05-01",
      "2026-04-01",
      "2026-03-01",
    ]);
  });

  it("clears a value by deleting its row, leaving the assessment behind", async () => {
    const niva = await createMetric({
      name: "Nivå",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 5,
    });

    await call(
      saveDevelopmentAssessmentHandler,
      {
        teamId,
        memberId,
        assessedOn: "2026-03-01",
        note: "Kvar",
        values: [{ metricId: niva, value: "3" }],
      },
      { context: coach.context }
    );
    await call(
      saveDevelopmentAssessmentHandler,
      {
        teamId,
        memberId,
        assessedOn: "2026-03-01",
        note: "Kvar",
        values: [{ metricId: niva, value: null }],
      },
      { context: coach.context }
    );

    const { assessments } = await call(
      memberDevelopmentHandler,
      { teamId, memberId },
      { context: coach.context }
    );
    expect(assessments).toHaveLength(1);
    expect(assessments[0]!.values).toEqual([]);
    expect(assessments[0]!.note).toBe("Kvar");
  });

  it("refuses a value outside the scale, naming the metric", async () => {
    const niva = await createMetric({
      name: "Nivå",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 5,
    });

    await expect(
      call(
        saveDevelopmentAssessmentHandler,
        {
          teamId,
          memberId,
          assessedOn: "2026-03-01",
          note: null,
          values: [{ metricId: niva, value: "9" }],
        },
        { context: coach.context }
      )
    ).rejects.toThrow(/Nivå/);
  });

  it("refuses a new value on an archived metric but lets an old one be edited", async () => {
    const niva = await createMetric({
      name: "Nivå",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 5,
    });
    await call(
      saveDevelopmentAssessmentHandler,
      {
        teamId,
        memberId,
        assessedOn: "2026-03-01",
        note: null,
        values: [{ metricId: niva, value: "3" }],
      },
      { context: coach.context }
    );
    await call(
      archiveDevelopmentMetricHandler,
      { teamId, metricId: niva, archived: true },
      { context: admin.context }
    );

    // Correcting March, where the metric already has a value, still works.
    await expect(
      call(
        saveDevelopmentAssessmentHandler,
        {
          teamId,
          memberId,
          assessedOn: "2026-03-01",
          note: null,
          values: [{ metricId: niva, value: "4" }],
        },
        { context: coach.context }
      )
    ).resolves.toBeDefined();

    // Starting to record against it again does not.
    await expect(
      call(
        saveDevelopmentAssessmentHandler,
        {
          teamId,
          memberId,
          assessedOn: "2026-06-01",
          note: null,
          values: [{ metricId: niva, value: "5" }],
        },
        { context: coach.context }
      )
    ).rejects.toThrow(/archived/i);
  });

  it("still labels an assessment whose metric was later archived", async () => {
    const niva = await createMetric({
      name: "Nivå",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 5,
    });
    await call(
      saveDevelopmentAssessmentHandler,
      {
        teamId,
        memberId,
        assessedOn: "2026-03-01",
        note: null,
        values: [{ metricId: niva, value: "3" }],
      },
      { context: coach.context }
    );
    await call(
      archiveDevelopmentMetricHandler,
      { teamId, metricId: niva, archived: true },
      { context: admin.context }
    );

    const { metrics, assessments } = await call(
      memberDevelopmentHandler,
      { teamId, memberId },
      { context: coach.context }
    );
    expect(metrics.map((m) => m.id)).toContain(niva);
    expect(assessments[0]!.values).toHaveLength(1);
  });

  it("treats a member from another team as not found", async () => {
    const otherTeam = await createTestTeam(db, club.clubId, "P17");
    await expect(
      call(
        memberDevelopmentHandler,
        { teamId: otherTeam, memberId },
        { context: admin.context }
      )
    ).rejects.toThrow(/not found/i);
  });

  it("deletes an assessment, and refuses one reached through the wrong team", async () => {
    const niva = await createMetric({
      name: "Nivå",
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 5,
    });
    const saved = await call(
      saveDevelopmentAssessmentHandler,
      {
        teamId,
        memberId,
        assessedOn: "2026-03-01",
        note: null,
        values: [{ metricId: niva, value: "3" }],
      },
      { context: coach.context }
    );
    const otherTeam = await createTestTeam(db, club.clubId, "P17");

    await expect(
      call(
        deleteDevelopmentAssessmentHandler,
        { teamId: otherTeam, assessmentId: saved.assessment.id },
        { context: admin.context }
      )
    ).rejects.toThrow(/not found/i);

    await call(
      deleteDevelopmentAssessmentHandler,
      { teamId, assessmentId: saved.assessment.id },
      { context: admin.context }
    );

    const { assessments } = await call(
      memberDevelopmentHandler,
      { teamId, memberId },
      { context: coach.context }
    );
    expect(assessments).toHaveLength(0);
    // The values went with it rather than being orphaned.
    const orphans = await db
      .selectFrom("development_values")
      .selectAll()
      .execute();
    expect(orphans).toHaveLength(0);
  });
});

describe("the development.manage gate", () => {
  /**
   * The whole reason the permission exists. A role that can see the roster is
   * not thereby entitled to read what a coach wrote about a child, so this is
   * asserted against a role that genuinely holds `members.view`.
   */
  it("withholds a member's development from a role that has members.view but not development.manage", async () => {
    const roleId = club.roleIds["coach"]!;
    await db
      .deleteFrom("role_permissions")
      .where("role_id", "=", roleId)
      .where("permission", "=", "development.manage")
      .execute();

    const permissions = await db
      .selectFrom("role_permissions")
      .select("permission")
      .where("role_id", "=", roleId)
      .execute();
    expect(permissions.map((p) => p.permission)).toContain("members.view");

    await expect(
      call(
        memberDevelopmentHandler,
        { teamId, memberId },
        { context: coach.context }
      )
    ).rejects.toThrow(/development\.manage/);
  });

  it("withholds recording as well as reading", async () => {
    const player = await createTestUser(db, club, { systemKey: "player" });
    await expect(
      call(
        saveDevelopmentAssessmentHandler,
        {
          teamId,
          memberId,
          assessedOn: "2026-03-01",
          note: null,
          values: [],
        },
        { context: player.context }
      )
    ).rejects.toThrow(/development\.manage/);
  });

  it("seeds the permission onto Coach, so a coach can read without being granted anything", async () => {
    await expect(
      call(
        memberDevelopmentHandler,
        { teamId, memberId },
        { context: coach.context }
      )
    ).resolves.toBeDefined();
  });

  it("lets a settings.team-only role read the metric list", async () => {
    // The list answers "what does this team measure?", which configuring it
    // needs as much as recording does (ADR-011).
    const roleId = club.roleIds["coach"]!;
    await db
      .deleteFrom("role_permissions")
      .where("role_id", "=", roleId)
      .where("permission", "=", "development.manage")
      .execute();

    await expect(
      call(listDevelopmentMetricsHandler, { teamId }, { context: coach.context })
    ).resolves.toBeDefined();
  });
});
