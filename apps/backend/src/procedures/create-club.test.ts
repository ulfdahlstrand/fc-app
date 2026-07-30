/** Club creation seeds roles, a first team and its defaults, in one transaction. */
import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import {
  DEFAULT_ACTIVITY_TYPES,
  DEFAULT_ATTENDANCE_STATUSES,
} from "@fc-app/contracts";
import type { Database } from "../db/types.js";
import { DEFAULT_ROLES } from "../tenancy/roles.js";
import { createClub } from "./create-club.js";

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const CLUB_ID = "550e8400-e29b-41d4-a716-446655440002";
const TEAM_ID = "550e8400-e29b-41d4-a716-446655440003";
const ADMIN_ROLE_ID = "550e8400-e29b-41d4-a716-446655440010";

/** Mock transaction. */
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

  it("seeds the new team with the default activity types (#11)", async () => {
    const { db, insertedValues } = buildDbMock();

    await createClub(db, USER_ID, "FC Test", "P14");

    // One bulk insert carrying every default type, in declaration order.
    expect(insertedValues["activity_types"]).toEqual([
      DEFAULT_ACTIVITY_TYPES.map((type, index) => ({
        team_id: TEAM_ID,
        name: type.name,
        colour: type.colour,
        supports_call_ups: type.supportsCallUps,
        sort_order: index,
      })),
    ]);
    // Match is the type that can have a squad called up (#16).
    expect(
      DEFAULT_ACTIVITY_TYPES.map((t) => [t.name, t.supportsCallUps])
    ).toEqual([
      ["Training", false],
      ["Match", true],
    ]);
  });

  it("seeds the new team with the default attendance statuses (#14)", async () => {
    const { db, insertedValues } = buildDbMock();

    await createClub(db, USER_ID, "FC Test", "P14");

    // The seeded order is the order a coach taps through at the pitch side.
    expect(insertedValues["attendance_statuses"]).toEqual([
      DEFAULT_ATTENDANCE_STATUSES.map((status, index) => ({
        team_id: TEAM_ID,
        name: status.name,
        colour: status.colour,
        counts_as_present: status.countsAsPresent,
        sort_order: index,
      })),
    ]);
    // Only Present counts towards the statistics (#15) reads.
    expect(
      DEFAULT_ATTENDANCE_STATUSES.map((s) => [s.name, s.countsAsPresent])
    ).toEqual([
      ["Present", true],
      ["Absent", false],
      ["Ill", false],
    ]);
  });
});
