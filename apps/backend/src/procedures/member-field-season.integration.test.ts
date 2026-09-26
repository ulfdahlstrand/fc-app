/**
 * A custom field tied to a season: the definition carries the season so the
 * roster can drop the column once it has ended, and only a season of the
 * field's own team may be named.
 *
 * Against a real database because the rules are about rows — which team a
 * season belongs to, and what deleting one does to the fields that named it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call, ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { closeTestDb, testDb, truncateAll } from "../test/database.js";
import {
  createTestClub,
  createTestUser,
  type TestClub,
  type TestUser,
} from "../test/fixtures.js";
import {
  createMemberFieldHandler,
  listMemberFieldsHandler,
  updateMemberFieldHandler,
} from "./member-fields.js";

let db: Kysely<Database>;
let club: TestClub;
let admin: TestUser;

async function createSeason(
  teamId: string,
  name: string,
  endsOn: string
): Promise<string> {
  const row = await db
    .insertInto("seasons")
    .values({ team_id: teamId, name, starts_on: "2026-01-01", ends_on: endsOn })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

beforeEach(async () => {
  db = await testDb();
  await truncateAll();
  club = await createTestClub(db);
  admin = await createTestUser(db, club, { systemKey: "admin" });
});

afterAll(async () => {
  await closeTestDb();
});

describe("member field seasons", () => {
  it("carries the season on the definition", async () => {
    const seasonId = await createSeason(club.teamId, "Säsong 2026", "2026-11-30");
    const created = await call(
      createMemberFieldHandler,
      { teamId: club.teamId, name: "Tröjnummer 2026", fieldType: "number", seasonId },
      { context: admin.context }
    );
    expect(created.field.season).toEqual({
      id: seasonId,
      name: "Säsong 2026",
      endsOn: "2026-11-30",
    });

    const listed = await call(
      listMemberFieldsHandler,
      { teamId: club.teamId },
      { context: admin.context }
    );
    expect(listed.fields[0]?.season?.endsOn).toBe("2026-11-30");
  });

  it("leaves a field without a season as null", async () => {
    const created = await call(
      createMemberFieldHandler,
      { teamId: club.teamId, name: "Allergier", fieldType: "text" },
      { context: admin.context }
    );
    expect(created.field.season).toBeNull();
  });

  it("ties and unties a field on update", async () => {
    const seasonId = await createSeason(club.teamId, "HT 2026", "2026-12-15");
    const created = await call(
      createMemberFieldHandler,
      { teamId: club.teamId, name: "Storlek", fieldType: "text" },
      { context: admin.context }
    );

    const tied = await call(
      updateMemberFieldHandler,
      { teamId: club.teamId, fieldId: created.field.id, seasonId },
      { context: admin.context }
    );
    expect(tied.field.season?.id).toBe(seasonId);

    const untied = await call(
      updateMemberFieldHandler,
      { teamId: club.teamId, fieldId: created.field.id, seasonId: null },
      { context: admin.context }
    );
    expect(untied.field.season).toBeNull();
  });

  it("refuses another team's season", async () => {
    const other = await createTestClub(db);
    const foreign = await createSeason(other.teamId, "Deras säsong", "2026-12-31");

    await expect(
      call(
        createMemberFieldHandler,
        {
          teamId: club.teamId,
          name: "Tröjnummer",
          fieldType: "number",
          seasonId: foreign,
        },
        { context: admin.context }
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ORPCError && error.code === "NOT_FOUND"
    );
  });

  it("keeps the field when its season is deleted", async () => {
    const seasonId = await createSeason(club.teamId, "VT 2026", "2026-06-30");
    const created = await call(
      createMemberFieldHandler,
      { teamId: club.teamId, name: "Tröjnummer", fieldType: "number", seasonId },
      { context: admin.context }
    );

    await db.deleteFrom("seasons").where("id", "=", seasonId).execute();

    const listed = await call(
      listMemberFieldsHandler,
      { teamId: club.teamId },
      { context: admin.context }
    );
    expect(listed.fields.map((field) => field.id)).toEqual([created.field.id]);
    expect(listed.fields[0]?.season).toBeNull();
  });
});
