import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { listMyClubs } from "./my-clubs.js";

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const CLUB_ID = "550e8400-e29b-41d4-a716-446655440002";
const TEAM_A = "550e8400-e29b-41d4-a716-446655440003";
const TEAM_B = "550e8400-e29b-41d4-a716-446655440004";

const TEAM_ROWS = [
  { id: TEAM_A, club_id: CLUB_ID, name: "P14" },
  { id: TEAM_B, club_id: CLUB_ID, name: "P15" },
];

interface MembershipSpec {
  teamId: string | null;
  roleId: string;
  name: string;
  systemKey: string | null;
  permissions: string[];
}

/**
 * Mock covering listMyClubs' query flow: distinct club_ids, clubs, teams, and
 * per-club getClubMemberships (memberships⋈roles + role_permissions).
 */
function buildDbMock(specs: MembershipSpec[]) {
  const membershipJoinRows = specs.map((spec) => ({
    id: `m-${spec.teamId ?? "club"}`,
    user_id: USER_ID,
    club_id: CLUB_ID,
    team_id: spec.teamId,
    role_id: spec.roleId,
    role_name: spec.name,
    role_system_key: spec.systemKey,
  }));
  const permissionRows = specs.flatMap((spec) =>
    spec.permissions.map((permission) => ({ role_id: spec.roleId, permission }))
  );

  const selectFrom = vi.fn((table: string) => {
    if (table === "memberships") {
      // Two shapes: distinct club_id list, and the innerJoin+select in
      // getClubMemberships. A single chain serves both; execute returns the
      // distinct ids unless innerJoin was called.
      let joined = false;
      const chain: Record<string, unknown> = {
        innerJoin: vi.fn(() => {
          joined = true;
          return chain;
        }),
        select: vi.fn(() => chain),
        distinct: vi.fn(() => chain),
        where: vi.fn(() => chain),
        execute: vi.fn(() =>
          Promise.resolve(
            joined
              ? membershipJoinRows
              : specs.length > 0
                ? [{ club_id: CLUB_ID }]
                : []
          )
        ),
      };
      return chain;
    }
    if (table === "role_permissions") {
      const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        where: vi.fn(() => chain),
        execute: vi.fn(() => Promise.resolve(permissionRows)),
      };
      return chain;
    }
    if (table === "clubs") {
      const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        execute: vi.fn(() =>
          Promise.resolve([{ id: CLUB_ID, name: "FC Test" }])
        ),
      };
      return chain;
    }
    // teams
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      execute: vi.fn(() => Promise.resolve(TEAM_ROWS)),
    };
    return chain;
  });

  return { db: { selectFrom } as unknown as Kysely<Database> };
}

describe("listMyClubs", () => {
  it("includes every team with the club-wide role and permissions", async () => {
    const { db } = buildDbMock([
      {
        teamId: null,
        roleId: "role-admin",
        name: "Admin",
        systemKey: "admin",
        permissions: ["settings.club", "members.manage"],
      },
    ]);
    const result = await listMyClubs(db, USER_ID);
    expect(result[0]?.role).toEqual("Admin");
    expect(result[0]?.permissions).toContain("settings.club");
    expect(result[0]?.teams.map((team) => team.id)).toEqual([TEAM_A, TEAM_B]);
    expect(result[0]?.teams[0]?.permissions).toContain("members.manage");
  });

  it("includes only the own teams with per-team roles for team-scoped memberships", async () => {
    const { db } = buildDbMock([
      {
        teamId: TEAM_A,
        roleId: "role-coach",
        name: "Coach",
        systemKey: "coach",
        permissions: ["members.manage"],
      },
    ]);
    const result = await listMyClubs(db, USER_ID);
    expect(result[0]?.role).toBeNull();
    expect(result[0]?.permissions).toEqual([]);
    expect(result[0]?.teams).toHaveLength(1);
    expect(result[0]?.teams[0]).toMatchObject({ id: TEAM_A, role: "Coach" });
  });

  it("returns an empty list without memberships", async () => {
    const { db } = buildDbMock([]);
    expect(await listMyClubs(db, USER_ID)).toEqual([]);
  });
});
