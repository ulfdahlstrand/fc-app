/**
 * Match levels and the squad proposal, against a real database (ADR-028).
 *
 * The rule itself is unit-tested; what only Postgres can answer is whether the
 * numbers fed into it are the right ones — a level read off the newest
 * assessment, attendance counted on trainings only, a match counted as played
 * only when the player was there, and at this level only when the match was
 * booked at it. And that the criteria survive a save of the squad.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call, ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { closeTestDb, testDb, truncateAll } from "../test/database.js";
import {
  createTestClub,
  createTestMember,
  createTestUser,
  type TestClub,
  type TestUser,
} from "../test/fixtures.js";
import { callupCandidatesHandler } from "./callup-candidates.js";
import {
  archiveCallupTemplateHandler,
  createCallupTemplateHandler,
  listCallupTemplatesHandler,
  updateCallupTemplateHandler,
} from "./callup-templates.js";
import { getCallupHandler, setCallupSquadHandler } from "./callups.js";

let db: Kysely<Database>;
let club: TestClub;
let admin: TestUser;
let teamId: string;
let metricId: string;
let trainingType: string;
let matchType: string;
let present: string;
let absent: string;

const LEVELS = ["Extra lätt", "XL/L", "Lätt", "Lätt/Medel", "Medel"];

async function activity(
  typeId: string,
  startsAt: string,
  cancelled = false
): Promise<string> {
  const row = await db
    .insertInto("activities")
    .values({
      team_id: teamId,
      activity_type_id: typeId,
      starts_at: new Date(startsAt),
      ends_at: null,
      title: null,
      location: null,
      notes: null,
      series_id: null,
      external_ref: null,
      cancelled,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function mark(activityId: string, memberId: string, statusId: string) {
  await db
    .insertInto("attendance_records")
    .values({
      activity_id: activityId,
      member_id: memberId,
      status_id: statusId,
      note: null,
    })
    .execute();
}

async function assess(memberId: string, day: string, level: number) {
  const assessment = await db
    .insertInto("development_assessments")
    .values({ member_id: memberId, assessed_on: day, note: "privat", created_by: null })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("development_values")
    .values({
      assessment_id: assessment.id,
      metric_id: metricId,
      value_number: level,
      value_text: null,
    })
    .execute();
}

async function createTemplate(name = "Lätt match") {
  const result = await call(
    createCallupTemplateHandler,
    {
      teamId,
      name,
      levelMetricId: metricId,
      minAttendanceRate: 60,
      slots: [
        { count: 2, levels: [3, 4] },
        { count: 1, levels: [4, 5] },
      ],
    },
    { context: admin.context }
  );
  return result.template;
}

beforeEach(async () => {
  db = await testDb();
  await truncateAll();
  club = await createTestClub(db);
  admin = await createTestUser(db, club, { systemKey: "admin" });
  teamId = club.teamId;

  const metric = await db
    .insertInto("development_metrics")
    .values({
      team_id: teamId,
      name: "Nivå",
      value_type: "scale",
      unit: null,
      scale_min: 1,
      scale_max: 5,
      scale_labels: JSON.stringify(LEVELS),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  metricId = metric.id;

  const types = await db
    .insertInto("activity_types")
    .values([
      { team_id: teamId, name: "Träning", supports_call_ups: false },
      { team_id: teamId, name: "Match", supports_call_ups: true },
    ])
    .returning(["id", "name"])
    .execute();
  trainingType = types.find((t) => t.name === "Träning")!.id;
  matchType = types.find((t) => t.name === "Match")!.id;

  const statuses = await db
    .insertInto("attendance_statuses")
    .values([
      { team_id: teamId, name: "Närvarande", counts_as_present: true },
      { team_id: teamId, name: "Frånvarande", counts_as_present: false },
    ])
    .returning(["id", "name"])
    .execute();
  present = statuses.find((s) => s.name === "Närvarande")!.id;
  absent = statuses.find((s) => s.name === "Frånvarande")!.id;
});

afterAll(async () => {
  await closeTestDb();
});

describe("match level templates", () => {
  it("creates, lists, edits and archives a template", async () => {
    const template = await createTemplate();
    expect(template.slots).toHaveLength(2);

    const updated = await call(
      updateCallupTemplateHandler,
      { teamId, templateId: template.id, slots: [{ count: 8, levels: [3] }] },
      { context: admin.context }
    );
    expect(updated.template.slots).toEqual([{ count: 8, levels: [3] }]);

    await call(
      archiveCallupTemplateHandler,
      { teamId, templateId: template.id, archived: true },
      { context: admin.context }
    );
    const listed = await call(
      listCallupTemplatesHandler,
      { teamId },
      { context: admin.context }
    );
    expect(listed.templates).toEqual([]);
  });

  it("refuses a level the scale does not have", async () => {
    await expect(
      call(
        createCallupTemplateHandler,
        {
          teamId,
          name: "Fel",
          levelMetricId: metricId,
          slots: [{ count: 1, levels: [9] }],
        },
        { context: admin.context }
      )
    ).rejects.toThrow(/outside the scale/);
  });

  it("refuses a metric that is not a scale", async () => {
    const text = await db
      .insertInto("development_metrics")
      .values({
        team_id: teamId,
        name: "Anteckning",
        value_type: "text",
        unit: null,
        scale_min: null,
        scale_max: null,
        scale_labels: "[]",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await expect(
      call(
        createCallupTemplateHandler,
        { teamId, name: "Text", levelMetricId: text.id, slots: [] },
        { context: admin.context }
      )
    ).rejects.toThrow(/scale metric/);
  });

  it("lets only settings.team change them", async () => {
    const player = await createTestUser(db, club, { systemKey: "player" });
    const refusal = await call(
      createCallupTemplateHandler,
      { teamId, name: "X", levelMetricId: metricId, slots: [] },
      { context: player.context }
    ).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(ORPCError);
    expect((refusal as ORPCError<string, unknown>).code).toBe("FORBIDDEN");
  });
});

describe("callupCandidates", () => {
  it("counts level, training attendance and matches played in the season", async () => {
    await db
      .insertInto("seasons")
      .values({ team_id: teamId, name: "VT 2026", starts_on: "2026-03-01", ends_on: "2026-06-30" })
      .execute();
    const template = await createTemplate();
    const otherLevel = await createTemplate("Medel match");

    const astrid = await createTestMember(db, teamId, { firstName: "Astrid" });
    const bo = await createTestMember(db, teamId, { firstName: "Bo" });

    // Newest assessment wins: Astrid went from Lätt to Lätt/Medel.
    await assess(astrid, "2026-03-05", 3);
    await assess(astrid, "2026-04-20", 4);

    // Before the season: not counted.
    const old = await activity(trainingType, "2026-02-10T17:00:00Z");
    await mark(old, bo, absent);

    const t1 = await activity(trainingType, "2026-03-10T17:00:00Z");
    const t2 = await activity(trainingType, "2026-03-17T17:00:00Z");
    const t3 = await activity(trainingType, "2026-03-24T17:00:00Z");
    const cancelled = await activity(trainingType, "2026-03-31T17:00:00Z", true);
    for (const t of [t1, t2, t3]) await mark(t, astrid, present);
    await mark(t1, bo, present);
    await mark(t2, bo, absent);
    await mark(t3, bo, absent);
    await mark(cancelled, bo, absent);

    // Matches: Astrid played one at this level and one at another; Bo was
    // called to one and did not come.
    const m1 = await activity(matchType, "2026-04-01T10:00:00Z");
    const m2 = await activity(matchType, "2026-04-08T10:00:00Z");
    await db
      .insertInto("callups")
      .values([
        { activity_id: m1, template_id: template.id },
        { activity_id: m2, template_id: otherLevel.id },
      ])
      .execute();
    await mark(m1, astrid, present);
    await mark(m2, astrid, present);
    await mark(m1, bo, absent);

    const match = await activity(matchType, "2026-05-02T10:00:00Z");

    const result = await call(
      callupCandidatesHandler,
      { teamId, activityId: match, templateId: template.id },
      { context: admin.context }
    );

    expect(result.scale.scaleLabels).toEqual(LEVELS);
    expect(result.period.seasonName).toBe("VT 2026");

    const byName = new Map(result.candidates.map((c) => [c.firstName, c]));
    expect(byName.get("Astrid")).toMatchObject({
      level: 4,
      attended: 3,
      marked: 3,
      attendanceRate: 100,
      matchesPlayed: 2,
      matchesAtThisLevel: 1,
    });
    expect(byName.get("Bo")).toMatchObject({
      level: null,
      attended: 1,
      marked: 3,
      attendanceRate: 33,
      matchesPlayed: 0,
      matchesAtThisLevel: 0,
    });
    // Only the number crosses over — never the assessment's note.
    expect(JSON.stringify(result)).not.toContain("privat");
  });

  it("names the coaches among a member's guardians, and only them", async () => {
    const template = await createTemplate();
    const match = await activity(matchType, "2026-05-02T10:00:00Z");
    const coach = await createTestUser(db, club, {
      systemKey: "coach",
      name: "Karin Tränare",
      teamId,
    });
    const parent = await createTestUser(db, club, {
      systemKey: "guardian",
      name: "Per Förälder",
    });
    const olle = await createTestMember(db, teamId, { firstName: "Olle" });
    const pia = await createTestMember(db, teamId, { firstName: "Pia" });
    await db
      .insertInto("member_guardians")
      .values([
        { member_id: olle, user_id: coach.userId, relation: "guardian" },
        { member_id: pia, user_id: parent.userId, relation: "guardian" },
      ])
      .execute();

    const result = await call(
      callupCandidatesHandler,
      { teamId, activityId: match, templateId: template.id },
      { context: admin.context }
    );
    const byName = new Map(result.candidates.map((c) => [c.firstName, c]));
    expect(byName.get("Olle")?.coachNames).toEqual(["Karin Tränare"]);
    expect(byName.get("Pia")?.coachNames).toEqual([]);
  });

  it("is gated on callups.manage", async () => {
    const template = await createTemplate();
    const match = await activity(matchType, "2026-05-02T10:00:00Z");
    const player = await createTestUser(db, club, { systemKey: "player" });
    const refusal = await call(
      callupCandidatesHandler,
      { teamId, activityId: match, templateId: template.id },
      { context: player.context }
    ).catch((error: unknown) => error);
    expect((refusal as ORPCError<string, unknown>).code).toBe("FORBIDDEN");
  });
});

describe("criteria on a call-up", () => {
  it("saves with the squad, reads back, and is kept when left out", async () => {
    const template = await createTemplate();
    const match = await activity(matchType, "2026-05-02T10:00:00Z");
    const astrid = await createTestMember(db, teamId, { firstName: "Astrid" });

    const criteria = {
      templateId: template.id,
      minAttendanceRate: 50,
      slots: [{ count: 7, levels: [3, 4] }],
      minCoachChildren: 1,
    };
    const saved = await call(
      setCallupSquadHandler,
      { teamId, activityId: match, memberIds: [astrid], criteria },
      { context: admin.context }
    );
    expect(saved.criteria).toEqual(criteria);

    // A later save of the squad alone does not wipe the level.
    await call(
      setCallupSquadHandler,
      { teamId, activityId: match, memberIds: [] },
      { context: admin.context }
    );
    const read = await call(
      getCallupHandler,
      { teamId, activityId: match },
      { context: admin.context }
    );
    expect(read.criteria).toEqual(criteria);

    const cleared = await call(
      setCallupSquadHandler,
      { teamId, activityId: match, memberIds: [], criteria: null },
      { context: admin.context }
    );
    expect(cleared.criteria).toBeNull();
  });

  it("refuses a mix without a match level, or off its scale", async () => {
    const template = await createTemplate();
    const match = await activity(matchType, "2026-05-02T10:00:00Z");
    await expect(
      call(
        setCallupSquadHandler,
        {
          teamId,
          activityId: match,
          memberIds: [],
          criteria: {
            templateId: null,
            minAttendanceRate: null,
            slots: [],
            minCoachChildren: 0,
          },
        },
        { context: admin.context }
      )
    ).rejects.toThrow(/match level/);
    await expect(
      call(
        setCallupSquadHandler,
        {
          teamId,
          activityId: match,
          memberIds: [],
          criteria: {
            templateId: template.id,
            minAttendanceRate: null,
            slots: [{ count: 1, levels: [42] }],
            minCoachChildren: 0,
          },
        },
        { context: admin.context }
      )
    ).rejects.toThrow(/outside the scale/);
  });
});
