import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { createClub } from "./create-club.js";

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const CLUB_ID = "550e8400-e29b-41d4-a716-446655440002";
const TEAM_ID = "550e8400-e29b-41d4-a716-446655440003";

/**
 * Mock transaction covering the three inserts. Rows returned per table;
 * inserted values captured for assertions.
 */
function buildDbMock() {
  const insertedValues: Record<string, unknown[]> = {};
  const returnedRows: Record<string, unknown> = {
    clubs: { id: CLUB_ID, name: "FC Test" },
    teams: { id: TEAM_ID, club_id: CLUB_ID, name: "P14" },
  };

  const insertInto = vi.fn((table: string) => ({
    values: vi.fn((values: unknown) => {
      insertedValues[table] = [...(insertedValues[table] ?? []), values];
      return {
        execute: vi.fn().mockResolvedValue([]),
        returning: vi.fn().mockReturnValue({
          executeTakeFirstOrThrow: vi
            .fn()
            .mockResolvedValue(returnedRows[table]),
        }),
      };
    }),
  }));

  const trx = { insertInto } as unknown as Kysely<Database>;
  const db = {
    transaction: () => ({
      execute: (fn: (trx: Kysely<Database>) => Promise<unknown>) => fn(trx),
    }),
  } as unknown as Kysely<Database>;

  return { db, insertedValues };
}

describe("createClub", () => {
  it("creates club, first team, and an admin membership for the creator", async () => {
    const { db, insertedValues } = buildDbMock();

    const result = await createClub(db, USER_ID, "FC Test", "P14");

    expect(result).toEqual({
      club: { id: CLUB_ID, name: "FC Test" },
      team: { id: TEAM_ID, clubId: CLUB_ID, name: "P14" },
    });
    expect(insertedValues["clubs"]).toEqual([{ name: "FC Test" }]);
    expect(insertedValues["teams"]).toEqual([
      { club_id: CLUB_ID, name: "P14" },
    ]);
    expect(insertedValues["memberships"]).toEqual([
      { user_id: USER_ID, club_id: CLUB_ID, team_id: null, role: "admin" },
    ]);
  });
});
