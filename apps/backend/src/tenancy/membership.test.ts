import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { requireMembership, requireTeamAccess } from "./membership.js";

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const CLUB_ID = "550e8400-e29b-41d4-a716-446655440002";
const TEAM_ID = "550e8400-e29b-41d4-a716-446655440003";

const MEMBERSHIP_ROW = {
  id: "550e8400-e29b-41d4-a716-446655440004",
  user_id: USER_ID,
  club_id: CLUB_ID,
  team_id: null as string | null,
  role: "admin",
};

/** Mock covering the select chains used by the membership helpers. */
function buildDbMock(options: {
  membershipRow?: typeof MEMBERSHIP_ROW | undefined;
  teamRow?: { id: string; club_id: string } | undefined;
}) {
  const membershipChain = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue(options.membershipRow),
  };
  const teamChain = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue(options.teamRow),
  };
  const selectFrom = vi.fn((table: string) =>
    table === "memberships" ? membershipChain : teamChain
  );
  return { db: { selectFrom } as unknown as Kysely<Database> };
}

describe("requireMembership", () => {
  it("returns the membership for a member", async () => {
    const { db } = buildDbMock({ membershipRow: MEMBERSHIP_ROW });
    const result = await requireMembership(db, USER_ID, CLUB_ID);
    expect(result).toEqual({
      id: MEMBERSHIP_ROW.id,
      userId: USER_ID,
      clubId: CLUB_ID,
      teamId: null,
      role: "admin",
    });
  });

  it("throws FORBIDDEN for a non-member", async () => {
    const { db } = buildDbMock({ membershipRow: undefined });
    await expect(requireMembership(db, USER_ID, CLUB_ID)).rejects.toThrow(
      ORPCError
    );
  });
});

describe("requireTeamAccess", () => {
  it("resolves the club through the team row, not client input", async () => {
    const { db } = buildDbMock({
      membershipRow: MEMBERSHIP_ROW,
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    const result = await requireTeamAccess(db, USER_ID, TEAM_ID);
    expect(result.clubId).toEqual(CLUB_ID);
    expect(result.membership.role).toEqual("admin");
  });

  it("throws FORBIDDEN for an unknown team", async () => {
    const { db } = buildDbMock({ teamRow: undefined });
    await expect(requireTeamAccess(db, USER_ID, TEAM_ID)).rejects.toThrow(
      ORPCError
    );
  });

  it("throws FORBIDDEN when the caller is not a member of the team's club", async () => {
    const { db } = buildDbMock({
      membershipRow: undefined,
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    await expect(requireTeamAccess(db, USER_ID, TEAM_ID)).rejects.toThrow(
      ORPCError
    );
  });

  it("allows a membership scoped to the requested team", async () => {
    const { db } = buildDbMock({
      membershipRow: { ...MEMBERSHIP_ROW, team_id: TEAM_ID },
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    const result = await requireTeamAccess(db, USER_ID, TEAM_ID);
    expect(result.teamId).toEqual(TEAM_ID);
  });

  it("throws FORBIDDEN when the membership is scoped to another team", async () => {
    const OTHER_TEAM_ID = "550e8400-e29b-41d4-a716-446655440099";
    const { db } = buildDbMock({
      membershipRow: { ...MEMBERSHIP_ROW, team_id: OTHER_TEAM_ID },
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    await expect(requireTeamAccess(db, USER_ID, TEAM_ID)).rejects.toThrow(
      ORPCError
    );
  });
});
