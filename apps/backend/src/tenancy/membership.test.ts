import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { requireMembership, requireTeamAccess } from "./membership.js";

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const CLUB_ID = "550e8400-e29b-41d4-a716-446655440002";
const TEAM_ID = "550e8400-e29b-41d4-a716-446655440003";
const OTHER_TEAM_ID = "550e8400-e29b-41d4-a716-446655440099";

function membershipRow(teamId: string | null, role = "admin") {
  return {
    id: `membership-${teamId ?? "club"}`,
    user_id: USER_ID,
    club_id: CLUB_ID,
    team_id: teamId,
    role,
  };
}

/** Mock covering the select chains used by the membership helpers. */
function buildDbMock(options: {
  membershipRows: ReturnType<typeof membershipRow>[];
  teamRow?: { id: string; club_id: string } | undefined;
}) {
  const membershipChain = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(options.membershipRows),
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
  it("returns all membership rows for a member", async () => {
    const { db } = buildDbMock({
      membershipRows: [membershipRow(null), membershipRow(TEAM_ID, "coach")],
    });
    const result = await requireMembership(db, USER_ID, CLUB_ID);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      userId: USER_ID,
      clubId: CLUB_ID,
      teamId: null,
      role: "admin",
    });
  });

  it("throws FORBIDDEN for a non-member", async () => {
    const { db } = buildDbMock({ membershipRows: [] });
    await expect(requireMembership(db, USER_ID, CLUB_ID)).rejects.toThrow(
      ORPCError
    );
  });
});

describe("requireTeamAccess", () => {
  it("resolves the club through the team row, not client input", async () => {
    const { db } = buildDbMock({
      membershipRows: [membershipRow(null)],
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    const result = await requireTeamAccess(db, USER_ID, TEAM_ID);
    expect(result.clubId).toEqual(CLUB_ID);
    expect(result.membership.role).toEqual("admin");
  });

  it("throws FORBIDDEN for an unknown team", async () => {
    const { db } = buildDbMock({ membershipRows: [], teamRow: undefined });
    await expect(requireTeamAccess(db, USER_ID, TEAM_ID)).rejects.toThrow(
      ORPCError
    );
  });

  it("throws FORBIDDEN when the caller is not a member of the team's club", async () => {
    const { db } = buildDbMock({
      membershipRows: [],
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    await expect(requireTeamAccess(db, USER_ID, TEAM_ID)).rejects.toThrow(
      ORPCError
    );
  });

  it("allows a membership scoped to the requested team", async () => {
    const { db } = buildDbMock({
      membershipRows: [membershipRow(TEAM_ID, "player")],
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    const result = await requireTeamAccess(db, USER_ID, TEAM_ID);
    expect(result.teamId).toEqual(TEAM_ID);
    expect(result.membership.role).toEqual("player");
  });

  it("throws FORBIDDEN when memberships are scoped to other teams only", async () => {
    const { db } = buildDbMock({
      membershipRows: [membershipRow(OTHER_TEAM_ID, "player")],
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    await expect(requireTeamAccess(db, USER_ID, TEAM_ID)).rejects.toThrow(
      ORPCError
    );
  });

  it("supports different roles in different teams of the same club", async () => {
    const { db } = buildDbMock({
      membershipRows: [
        membershipRow(OTHER_TEAM_ID, "player"),
        membershipRow(TEAM_ID, "coach"),
      ],
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    const result = await requireTeamAccess(db, USER_ID, TEAM_ID);
    expect(result.membership.role).toEqual("coach");
  });

  it("prefers the team-scoped role over the club-wide role", async () => {
    const { db } = buildDbMock({
      membershipRows: [membershipRow(null, "admin"), membershipRow(TEAM_ID, "coach")],
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    const result = await requireTeamAccess(db, USER_ID, TEAM_ID);
    expect(result.membership.role).toEqual("coach");
  });
});
