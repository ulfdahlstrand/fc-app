/**
 * The team's say over its custom fields: what order they come back in, and
 * which of them the roster may show as a column.
 *
 * Against a real database because both claims are about rows. Reordering
 * rewrites every `sort_order` in one transaction, and the rule that an order
 * sent from a stale list keeps the fields it never mentioned is only true if
 * the handler actually reads what is there first.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call } from "@orpc/server";
import { ORPCError } from "@orpc/server";
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
  reorderMemberFieldsHandler,
  updateMemberFieldHandler,
} from "./member-fields.js";

let db: Kysely<Database>;
let club: TestClub;
let admin: TestUser;

async function createField(name: string): Promise<string> {
  const result = await call(
    createMemberFieldHandler,
    { teamId: club.teamId, name, fieldType: "text" },
    { context: admin.context }
  );
  return result.field.id;
}

async function fieldNames(): Promise<string[]> {
  const result = await call(
    listMemberFieldsHandler,
    { teamId: club.teamId },
    { context: admin.context }
  );
  return result.fields.map((field) => field.name);
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

describe("reorderMemberFields", () => {
  it("puts the fields in the order it was given", async () => {
    const jersey = await createField("Tröjnummer");
    const position = await createField("Position");
    const allergy = await createField("Allergier");

    expect(await fieldNames()).toEqual([
      "Tröjnummer",
      "Position",
      "Allergier",
    ]);

    await call(
      reorderMemberFieldsHandler,
      { teamId: club.teamId, fieldIds: [allergy, jersey, position] },
      { context: admin.context }
    );

    expect(await fieldNames()).toEqual([
      "Allergier",
      "Tröjnummer",
      "Position",
    ]);
  });

  it("keeps a field the order never mentioned, behind the ones it did", async () => {
    const jersey = await createField("Tröjnummer");
    const position = await createField("Position");
    // Added after the client read the list — it must survive the reorder.
    const allergy = await createField("Allergier");

    await call(
      reorderMemberFieldsHandler,
      { teamId: club.teamId, fieldIds: [position, jersey] },
      { context: admin.context }
    );

    expect(await fieldNames()).toEqual([
      "Position",
      "Tröjnummer",
      "Allergier",
    ]);
    expect(allergy).toBeTruthy();
  });

  it("refuses a field from another team", async () => {
    await createField("Tröjnummer");
    const otherClub = await createTestClub(db, "Grannklubben");
    const otherAdmin = await createTestUser(db, otherClub, {
      systemKey: "admin",
    });
    const foreign = await call(
      createMemberFieldHandler,
      { teamId: otherClub.teamId, name: "Position", fieldType: "text" },
      { context: otherAdmin.context }
    );

    await expect(
      call(
        reorderMemberFieldsHandler,
        { teamId: club.teamId, fieldIds: [foreign.field.id] },
        { context: admin.context }
      )
    ).rejects.toThrow(ORPCError);
  });

  it("refuses the same field twice", async () => {
    const jersey = await createField("Tröjnummer");

    await expect(
      call(
        reorderMemberFieldsHandler,
        { teamId: club.teamId, fieldIds: [jersey, jersey] },
        { context: admin.context }
      )
    ).rejects.toThrow(ORPCError);
  });

  // Coaches do hold settings.team — the roles that do not are the ones on the
  // other side of the roster.
  it("is refused for a role without settings.team", async () => {
    const jersey = await createField("Tröjnummer");
    const player = await createTestUser(db, club, {
      systemKey: "player",
      teamId: club.teamId,
    });

    await expect(
      call(
        reorderMemberFieldsHandler,
        { teamId: club.teamId, fieldIds: [jersey] },
        { context: player.context }
      )
    ).rejects.toThrow(ORPCError);
  });
});

describe("showInList", () => {
  it("defaults to on, so a new field is a column the roster may show", async () => {
    await createField("Tröjnummer");
    const result = await call(
      listMemberFieldsHandler,
      { teamId: club.teamId },
      { context: admin.context }
    );
    expect(result.fields[0]?.showInList).toBe(true);
  });

  it("can be turned off, and stays off", async () => {
    const allergy = await createField("Allergier");

    await call(
      updateMemberFieldHandler,
      { teamId: club.teamId, fieldId: allergy, showInList: false },
      { context: admin.context }
    );

    const result = await call(
      listMemberFieldsHandler,
      { teamId: club.teamId },
      { context: admin.context }
    );
    expect(result.fields[0]?.showInList).toBe(false);
  });

  it("can be set at creation", async () => {
    await call(
      createMemberFieldHandler,
      {
        teamId: club.teamId,
        name: "Allergier",
        fieldType: "text",
        showInList: false,
      },
      { context: admin.context }
    );

    const result = await call(
      listMemberFieldsHandler,
      { teamId: club.teamId },
      { context: admin.context }
    );
    expect(result.fields[0]?.showInList).toBe(false);
  });
});
