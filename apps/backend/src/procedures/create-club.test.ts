import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { DEFAULT_ROLES } from "../tenancy/roles.js";
import { createClub } from "./create-club.js";

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const CLUB_ID = "550e8400-e29b-41d4-a716-446655440002";
const TEAM_ID = "550e8400-e29b-41d4-a716-446655440003";
const ADMIN_ROLE_ID = "550e8400-e29b-41d4-a716-446655440010";

/**
 * Mock transaction. Each roles insert returns an id derived from the role's
 * system_key so seedClubRoles can capture the admin role id; other inserts
 * return their fixed rows. Inserted values are captured for assertions.
 */
function buildDbMock() {
  const insertedValues: Record<string, unknown[]> = {};

  const insertInto = vi.fn((table: string) => ({
    values: vi.fn((values: unknown) => {
      insertedValues[table] = [...(insertedValues[table] ?? []), values];
      const returnedRow =
        table === "clubs"
          ? { id: CLUB_ID, name: "FC Test" }
          : table === "teams"
            ? { id: TEAM_ID, club_id: CLUB_ID, name: "P14" }
            : table === "roles"
              ? {
                  id:
                    (values as { system_key: string }).system_key === "admin"
                      ? ADMIN_ROLE_ID
                      : `role-${(values as { system_key: string }).system_key}`,
                }
              : {};
      return {
        execute: vi.fn().mockResolvedValue([]),
        returning: vi.fn().mockReturnValue({
          executeTakeFirstOrThrow: vi.fn().mockResolvedValue(returnedRow),
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
  it("creates club, seeds default roles, first team, and admin membership", async () => {
    const { db, insertedValues } = buildDbMock();

    const result = await createClub(db, USER_ID, "FC Test", "P14");

    expect(result).toEqual({
      club: { id: CLUB_ID, name: "FC Test" },
      team: { id: TEAM_ID, clubId: CLUB_ID, name: "P14" },
    });
    expect(insertedValues["clubs"]).toEqual([{ name: "FC Test" }]);
    // One roles insert per default role, admin first.
    expect(insertedValues["roles"]).toHaveLength(DEFAULT_ROLES.length);
    expect(insertedValues["teams"]).toEqual([
      { club_id: CLUB_ID, name: "P14" },
    ]);
    // The creator's membership points at the seeded admin role.
    expect(insertedValues["memberships"]).toEqual([
      {
        user_id: USER_ID,
        club_id: CLUB_ID,
        team_id: null,
        role_id: ADMIN_ROLE_ID,
      },
    ]);
  });
});
