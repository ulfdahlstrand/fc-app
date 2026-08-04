/**
 * The import, against a real database.
 *
 * Two of the bugs #64 shipped were invisible to both the type checker and the
 * mocked tests, because both are about what Postgres actually stores: an
 * e-mail differing only in case was overwritten although the preview called it
 * unchanged, and a phone change was written without ever appearing in the
 * diff. A third — the club person register — is a constraint question, which
 * a mock cannot answer at all.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call } from "@orpc/server";
import type { Kysely } from "kysely";
import type { ImportRow } from "@fc-app/contracts";
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
  commitMemberImportHandler,
  previewMemberImportHandler,
} from "./member-import.js";

let db: Kysely<Database>;
let club: TestClub;
let admin: TestUser;

beforeEach(async () => {
  db = await testDb();
  await truncateAll();
  club = await createTestClub(db);
  admin = await createTestUser(db, club, { systemKey: "admin" });
});

afterAll(async () => {
  await closeTestDb();
});

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    rowNumber: 2,
    firstName: "Ture",
    lastName: "Dahlstrand",
    personalId: null,
    externalRef: null,
    email: null,
    phone: null,
    groups: [],
    customFields: {},
    contacts: [],
    ...overrides,
  };
}

const preview = (teamId: string, rows: ImportRow[]) =>
  call(previewMemberImportHandler, { teamId, rows }, { context: admin.context });

const commit = (teamId: string, rows: ImportRow[]) =>
  call(commitMemberImportHandler, { teamId, rows }, { context: admin.context });

describe("member import against real data", () => {
  it("leaves an address that differs only in case alone", async () => {
    const memberId = await createTestMember(db, club.teamId, {
      firstName: "Alva",
      lastName: "Nilsson",
      email: "alva@example.test",
    });

    const rows = [
      row({ firstName: "Alva", lastName: "Nilsson", email: "ALVA@example.test" }),
    ];

    const previewed = await preview(club.teamId, rows);
    expect(previewed.rows[0]?.changes.map((c) => c.field)).not.toContain("email");

    await commit(club.teamId, rows);

    const stored = await db
      .selectFrom("members")
      .select("email")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    // The commit must not write what the preview called unchanged.
    expect(stored.email).toBe("alva@example.test");
  });

  it("shows a phone change in the diff before writing it", async () => {
    const memberId = await createTestMember(db, club.teamId, {
      firstName: "Alva",
      lastName: "Nilsson",
      email: "alva@example.test",
      phone: null,
    });

    const rows = [
      row({
        firstName: "Alva",
        lastName: "Nilsson",
        email: "alva@example.test",
        phone: "070-111 22 33",
      }),
    ];

    const previewed = await preview(club.teamId, rows);
    expect(previewed.rows[0]?.changes.map((c) => c.field)).toContain("phone");

    await commit(club.teamId, rows);

    const stored = await db
      .selectFrom("members")
      .select("phone")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(stored.phone).toBe("070-111 22 33");
  });

  it("imports the same file twice with nothing to show for the second", async () => {
    const rows = [
      row({ personalId: "20170314-2412", email: "ture@example.test" }),
      row({ rowNumber: 3, firstName: "Ulf", personalId: "19850822-3578" }),
    ];

    const first = await commit(club.teamId, rows);
    expect(first.summary).toMatchObject({ created: 2, updated: 0 });

    const second = await commit(club.teamId, rows);
    expect(second.summary).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 2,
    });

    const members = await db
      .selectFrom("members")
      .select("id")
      .where("team_id", "=", club.teamId)
      .execute();
    expect(members).toHaveLength(2);
  });

  it("is one person in two teams, not two people", async () => {
    const other = await createTestTeam(db, club.clubId, "P17");
    const rows = [row({ personalId: "20170314-2412" })];

    await commit(club.teamId, rows);

    const warned = await preview(other, rows);
    expect(warned.rows[0]?.outcome).toBe("new");
    expect(warned.rows[0]?.warnings.map((w) => w.code)).toContain(
      "alreadyInAnotherTeam"
    );

    await commit(other, rows);

    const persons = await db.selectFrom("persons").selectAll().execute();
    expect(persons).toHaveLength(1);

    const members = await db
      .selectFrom("members")
      .select(["team_id", "person_id"])
      .execute();
    expect(members).toHaveLength(2);
    expect(new Set(members.map((m) => m.person_id)).size).toBe(1);
    // The first team's member is a different row, not an updated one.
    expect(new Set(members.map((m) => m.team_id)).size).toBe(2);
  });

  it("treats a number it already knows as the same person under a new name", async () => {
    await commit(club.teamId, [row({ personalId: "20170314-2412" })]);

    // Same number, different name. People change their names; the number is
    // what identifies them, so this is one member renamed, not a second one.
    await expect(
      commit(club.teamId, [
        row({ rowNumber: 3, firstName: "Kopia", personalId: "20170314-2412" }),
      ])
    ).resolves.toMatchObject({ summary: { errors: 0, created: 0, updated: 1 } });

    const members = await db
      .selectFrom("members")
      .select("id")
      .where("team_id", "=", club.teamId)
      .execute();
    expect(members).toHaveLength(1);
  });

  it("writes nothing at all when previewing", async () => {
    const before = await db.selectFrom("members").select("id").execute();

    await preview(club.teamId, [
      row({ personalId: "20170314-2412", groups: ["Spelare"] }),
    ]);

    const after = await db.selectFrom("members").select("id").execute();
    const groups = await db.selectFrom("groups").select("id").execute();
    const persons = await db.selectFrom("persons").select("id").execute();
    expect(after).toHaveLength(before.length);
    expect(groups).toHaveLength(0);
    expect(persons).toHaveLength(0);
  });
});
