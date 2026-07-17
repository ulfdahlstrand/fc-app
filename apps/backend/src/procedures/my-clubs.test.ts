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

function buildDbMock(membershipRows: unknown[]) {
  const membershipChain = {
    innerJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(membershipRows),
  };
  const teamChain = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(TEAM_ROWS),
  };
  const selectFrom = vi.fn((table: string) =>
    table === "memberships" ? membershipChain : teamChain
  );
  return { db: { selectFrom } as unknown as Kysely<Database> };
}

describe("listMyClubs", () => {
  it("includes every team with the club-wide role for a club-wide membership", async () => {
    const { db } = buildDbMock([
      { id: CLUB_ID, name: "FC Test", role: "admin", team_id: null },
    ]);
    const result = await listMyClubs(db, USER_ID);
    expect(result[0]?.role).toEqual("admin");
    expect(result[0]?.teams).toEqual([
      { id: TEAM_A, clubId: CLUB_ID, name: "P14", role: "admin" },
      { id: TEAM_B, clubId: CLUB_ID, name: "P15", role: "admin" },
    ]);
  });

  it("includes only the own teams with per-team roles for team-scoped memberships", async () => {
    const { db } = buildDbMock([
      { id: CLUB_ID, name: "FC Test", role: "player", team_id: TEAM_A },
      { id: CLUB_ID, name: "FC Test", role: "coach", team_id: TEAM_B },
    ]);
    const result = await listMyClubs(db, USER_ID);
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBeNull();
    expect(result[0]?.teams).toEqual([
      { id: TEAM_A, clubId: CLUB_ID, name: "P14", role: "player" },
      { id: TEAM_B, clubId: CLUB_ID, name: "P15", role: "coach" },
    ]);
  });

  it("lets the team-scoped role win over the club-wide role", async () => {
    const { db } = buildDbMock([
      { id: CLUB_ID, name: "FC Test", role: "admin", team_id: null },
      { id: CLUB_ID, name: "FC Test", role: "coach", team_id: TEAM_A },
    ]);
    const result = await listMyClubs(db, USER_ID);
    expect(result[0]?.teams).toEqual([
      { id: TEAM_A, clubId: CLUB_ID, name: "P14", role: "coach" },
      { id: TEAM_B, clubId: CLUB_ID, name: "P15", role: "admin" },
    ]);
  });

  it("returns an empty list without memberships", async () => {
    const { db } = buildDbMock([]);
    expect(await listMyClubs(db, USER_ID)).toEqual([]);
  });
});
