/**
 * The attendance import, against a real database (#85).
 *
 * Everything this feature promises is a statement about what Postgres ends up
 * holding: that the same season imported twice writes nothing the second
 * time, that two matches beginning at the same minute stay two activities,
 * and that an unmarked cell leaves no row behind. None of those can be
 * answered by a mock, which has no unique constraints and no `ON CONFLICT`.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call } from "@orpc/server";
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
  commitAttendanceImportHandler,
  previewAttendanceImportHandler,
} from "./attendance-import.js";

let db: Kysely<Database>;
let club: TestClub;
let admin: TestUser;
let teamId: string;
let trainingTypeId: string;
let presentId: string;
let absentId: string;
let tureId: string;
let alvaId: string;

const TIME_ZONE = "Europe/Stockholm";

beforeEach(async () => {
  db = await testDb();
  await truncateAll();
  club = await createTestClub(db);
  admin = await createTestUser(db, club, { systemKey: "admin" });
  teamId = await createTestTeam(db, club.clubId, "P17");

  const training = await db
    .insertInto("activity_types")
    .values({ team_id: teamId, name: "Träning", colour: "green" })
    .returning("id")
    .executeTakeFirstOrThrow();
  trainingTypeId = training.id;

  const present = await db
    .insertInto("attendance_statuses")
    .values({
      team_id: teamId,
      name: "Närvarande",
      colour: "green",
      counts_as_present: true,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  presentId = present.id;

  const absent = await db
    .insertInto("attendance_statuses")
    .values({
      team_id: teamId,
      name: "Frånvarande",
      colour: "orange",
      counts_as_present: false,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  absentId = absent.id;

  tureId = await createTestMember(db, teamId, {
    firstName: "Ture",
    lastName: "Dahlstrand",
  });
  alvaId = await createTestMember(db, teamId, {
    firstName: "Alva",
    lastName: "Berg",
  });
});

afterAll(async () => {
  await closeTestDb();
});

function activity(overrides: Record<string, unknown> = {}) {
  return {
    externalRef: "a1",
    date: "2026-03-24",
    time: "17:00",
    typeName: "Träning",
    title: null,
    confirmed: true,
    lokEligible: true,
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    teamId,
    timeZone: TIME_ZONE,
    activities: [activity()],
    rows: [
      {
        rowNumber: 1,
        firstName: "Ture",
        lastName: "Dahlstrand",
        externalRef: "m1",
        marks: { "0": "present" },
      },
    ],
    statusMapping: [
      { value: "present", statusId: presentId },
      { value: "absent", statusId: absentId },
    ],
    typeMapping: [{ sourceName: "Träning", activityTypeId: trainingTypeId }],
    ...overrides,
  };
}

async function commit(overrides: Record<string, unknown> = {}) {
  return call(commitAttendanceImportHandler, input(overrides), {
    context: admin.context,
  });
}

async function storedMarks() {
  return db
    .selectFrom("attendance_records")
    .select(["activity_id", "member_id", "status_id"])
    .execute();
}

describe("commitAttendanceImport", () => {
  it("creates the activity and writes the mark", async () => {
    const report = await commit();

    expect(report.summary.activitiesCreated).toBe(1);
    expect(report.summary.marksAdded).toBe(1);

    const activities = await db
      .selectFrom("activities")
      .selectAll()
      .where("team_id", "=", teamId)
      .execute();
    expect(activities).toHaveLength(1);
    expect(activities[0]?.external_ref).toBe("a1");
    // 17:00 Swedish summer time is 15:00Z — resolved by the same helper the
    // recurring-activity generator uses.
    expect(activities[0]?.starts_at.toISOString()).toBe(
      "2026-03-24T16:00:00.000Z"
    );
    expect(activities[0]?.series_id).toBeNull();
    expect(activities[0]?.cancelled).toBe(false);

    const marks = await storedMarks();
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({
      member_id: tureId,
      status_id: presentId,
    });
  });

  it("writes nothing the second time — the acceptance test", async () => {
    await commit();
    const again = await commit();

    expect(again.summary).toMatchObject({
      activitiesCreated: 0,
      activitiesReused: 1,
      marksAdded: 0,
      marksChanged: 0,
      marksUnchanged: 1,
    });
    expect(await storedMarks()).toHaveLength(1);
    expect(
      await db.selectFrom("activities").selectAll().execute()
    ).toHaveLength(1);
  });

  it("keeps two activities that start at the same minute apart", async () => {
    const report = await commit({
      activities: [
        activity({ externalRef: "a1", time: "10:00", date: "2026-04-25" }),
        activity({ externalRef: "a2", time: "10:00", date: "2026-04-25" }),
      ],
      rows: [
        {
          rowNumber: 1,
          firstName: "Ture",
          lastName: "Dahlstrand",
          externalRef: "m1",
          marks: { "0": "present", "1": "present" },
        },
      ],
    });

    expect(report.summary.activitiesCreated).toBe(2);
    expect(await storedMarks()).toHaveLength(2);
  });

  it("leaves an unconfirmed column alone entirely", async () => {
    const report = await commit({
      activities: [activity({ confirmed: false })],
      rows: [
        {
          rowNumber: 1,
          firstName: "Ture",
          lastName: "Dahlstrand",
          externalRef: "m1",
          marks: {},
        },
      ],
    });

    expect(report.summary.activitiesSkipped).toBe(1);
    expect(await db.selectFrom("activities").selectAll().execute()).toEqual([]);
    expect(await storedMarks()).toEqual([]);
  });

  it("writes nothing before a member's first attendance", async () => {
    // Alva joins at the third training: two absences that are not hers.
    const report = await commit({
      activities: [
        activity({ externalRef: "a1", date: "2026-03-24" }),
        activity({ externalRef: "a2", date: "2026-03-26" }),
        activity({ externalRef: "a3", date: "2026-03-31" }),
      ],
      rows: [
        {
          rowNumber: 1,
          firstName: "Alva",
          lastName: "Berg",
          externalRef: "m2",
          marks: { "0": "absent", "1": "absent", "2": "present" },
        },
      ],
    });

    expect(report.rows[0]).toMatchObject({
      added: 1,
      beforeJoining: 2,
    });
    const marks = await storedMarks();
    expect(marks).toHaveLength(1);
    expect(marks[0]?.member_id).toBe(alvaId);
  });

  it("changes a mark that disagrees, rather than adding a second row", async () => {
    const twoDays = {
      activities: [
        activity({ externalRef: "a1", date: "2026-03-24" }),
        activity({ externalRef: "a2", date: "2026-03-26" }),
      ],
    };
    await commit({
      ...twoDays,
      rows: [
        {
          rowNumber: 1,
          firstName: "Ture",
          lastName: "Dahlstrand",
          externalRef: "m1",
          marks: { "0": "present", "1": "present" },
        },
      ],
    });

    const changed = await commit({
      ...twoDays,
      rows: [
        {
          rowNumber: 1,
          firstName: "Ture",
          lastName: "Dahlstrand",
          externalRef: "m1",
          marks: { "0": "present", "1": "absent" },
        },
      ],
    });

    expect(changed.summary).toMatchObject({
      marksChanged: 1,
      marksUnchanged: 1,
      marksAdded: 0,
    });
    const marks = await storedMarks();
    expect(marks).toHaveLength(2);
    expect(marks.filter((m) => m.status_id === absentId)).toHaveLength(1);
  });

  it("writes nothing for a member the window shows no attendance for", async () => {
    // The cost of "blanks before a first mark are unmarked": if the imported
    // window contains no attendance at all for someone, none of it counts as
    // their history and none of their absences are written. Over a season
    // that is right — a member with no attendance was not in the team — but
    // it does mean a correction from present to absent cannot be made by
    // re-importing a single column on its own.
    await commit();
    const corrected = await commit({
      rows: [
        {
          rowNumber: 1,
          firstName: "Ture",
          lastName: "Dahlstrand",
          externalRef: "m1",
          marks: { "0": "absent" },
        },
      ],
    });

    expect(corrected.summary.marksChanged).toBe(0);
    expect(corrected.rows[0]?.beforeJoining).toBe(1);
    const marks = await storedMarks();
    expect(marks).toHaveLength(1);
    expect(marks[0]?.status_id).toBe(presentId);
  });

  it("creates an activity type the mapping asks for, with its colour", async () => {
    const report = await commit({
      activities: [activity({ typeName: "Övrigt" })],
      typeMapping: [
        { sourceName: "Övrigt", activityTypeId: null, colour: "amber" },
      ],
    });

    expect(report.newActivityTypes).toEqual(["Övrigt"]);
    const created = await db
      .selectFrom("activity_types")
      .selectAll()
      .where("name", "=", "Övrigt")
      .executeTakeFirstOrThrow();
    expect(created.colour).toBe("amber");
    expect(created.supports_call_ups).toBe(false);
  });

  it("commits every other row when one cannot be matched", async () => {
    const report = await commit({
      rows: [
        {
          rowNumber: 1,
          firstName: "Ingen",
          lastName: "Sådan",
          externalRef: "m9",
          marks: { "0": "present" },
        },
        {
          rowNumber: 2,
          firstName: "Ture",
          lastName: "Dahlstrand",
          externalRef: "m1",
          marks: { "0": "present" },
        },
      ],
    });

    expect(report.rows[0]?.errors[0]?.code).toBe("memberNotFound");
    expect(report.summary.marksAdded).toBe(1);
    expect(await storedMarks()).toHaveLength(1);
  });

  it("refuses a caller who may record attendance but not import it", async () => {
    const coach = await createTestUser(db, club, { systemKey: "coach" });
    await expect(
      call(commitAttendanceImportHandler, input(), { context: coach.context })
    ).rejects.toThrow(/attendance.import/);
  });
});

describe("previewAttendanceImport", () => {
  it("writes nothing", async () => {
    const report = await call(previewAttendanceImportHandler, input(), {
      context: admin.context,
    });

    expect(report.summary.activitiesCreated).toBe(1);
    expect(await db.selectFrom("activities").selectAll().execute()).toEqual([]);
    expect(await storedMarks()).toEqual([]);
  });

  it("promises exactly what the commit then does", async () => {
    const promised = await call(previewAttendanceImportHandler, input(), {
      context: admin.context,
    });
    const done = await commit();
    expect(done.summary).toEqual(promised.summary);
  });
});
