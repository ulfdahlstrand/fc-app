import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Permission } from "@fc-app/contracts";
import type { Database } from "../db/types.js";
import {
  requireClubPermission,
  requireMembership,
  requireTeamAccess,
  requireTeamPermission,
} from "./membership.js";

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const CLUB_ID = "550e8400-e29b-41d4-a716-446655440002";
const TEAM_ID = "550e8400-e29b-41d4-a716-446655440003";
const OTHER_TEAM_ID = "550e8400-e29b-41d4-a716-446655440099";

interface RoleSpec {
  teamId: string | null;
  roleId: string;
  name: string;
  systemKey: string | null;
  permissions: Permission[];
}

function membershipRow(spec: RoleSpec) {
  return {
    id: `membership-${spec.teamId ?? "club"}`,
    user_id: USER_ID,
    club_id: CLUB_ID,
    team_id: spec.teamId,
    role_id: spec.roleId,
    role_name: spec.name,
    role_system_key: spec.systemKey,
  };
}

/**
 * Mock covering the query shapes used by the membership helpers:
 * memberships⋈roles select, role_permissions select, and the teams lookup.
 */
function buildDbMock(options: {
  specs: RoleSpec[];
  teamRow?: { id: string; club_id: string } | undefined;
}) {
  const membershipRows = options.specs.map(membershipRow);
  const permissionRows = options.specs.flatMap((spec) =>
    spec.permissions.map((permission) => ({
      role_id: spec.roleId,
      permission,
    }))
  );

  const membershipChain = {
    innerJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(membershipRows),
  };
  const permissionChain = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(permissionRows),
  };
  const teamChain = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue(options.teamRow),
  };
  const selectFrom = vi.fn((table: string) => {
    if (table === "memberships") return membershipChain;
    if (table === "role_permissions") return permissionChain;
    return teamChain;
  });
  return { db: { selectFrom } as unknown as Kysely<Database> };
}

const adminSpec: RoleSpec = {
  teamId: null,
  roleId: "role-admin",
  name: "Admin",
  systemKey: "admin",
  permissions: ["settings.club", "members.manage"],
};

describe("requireMembership", () => {
  it("returns all membership rows with permissions for a member", async () => {
    const { db } = buildDbMock({
      specs: [
        adminSpec,
        {
          teamId: TEAM_ID,
          roleId: "role-coach",
          name: "Coach",
          systemKey: "coach",
          permissions: ["members.manage"],
        },
      ],
    });
    const result = await requireMembership(db, USER_ID, CLUB_ID);
    expect(result).toHaveLength(2);
    expect(result[0]?.permissions).toContain("settings.club");
  });

  it("throws FORBIDDEN for a non-member", async () => {
    const { db } = buildDbMock({ specs: [] });
    await expect(requireMembership(db, USER_ID, CLUB_ID)).rejects.toThrow(
      ORPCError
    );
  });
});

describe("requireClubPermission", () => {
  it("passes when a membership grants the permission", async () => {
    const { db } = buildDbMock({ specs: [adminSpec] });
    await expect(
      requireClubPermission(db, USER_ID, CLUB_ID, "settings.club")
    ).resolves.toHaveLength(1);
  });

  it("throws FORBIDDEN when no membership grants it", async () => {
    const { db } = buildDbMock({
      specs: [{ ...adminSpec, permissions: ["members.view"] }],
    });
    await expect(
      requireClubPermission(db, USER_ID, CLUB_ID, "settings.club")
    ).rejects.toThrow(ORPCError);
  });
});

describe("requireTeamAccess", () => {
  it("resolves the club through the team row, not client input", async () => {
    const { db } = buildDbMock({
      specs: [adminSpec],
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    const result = await requireTeamAccess(db, USER_ID, TEAM_ID);
    expect(result.clubId).toEqual(CLUB_ID);
    expect(result.membership.roleName).toEqual("Admin");
  });

  it("throws FORBIDDEN for an unknown team", async () => {
    const { db } = buildDbMock({ specs: [], teamRow: undefined });
    await expect(requireTeamAccess(db, USER_ID, TEAM_ID)).rejects.toThrow(
      ORPCError
    );
  });

  it("throws FORBIDDEN when memberships are scoped to other teams only", async () => {
    const { db } = buildDbMock({
      specs: [
        {
          teamId: OTHER_TEAM_ID,
          roleId: "role-player",
          name: "Player",
          systemKey: "player",
          permissions: ["callups.respond"],
        },
      ],
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    await expect(requireTeamAccess(db, USER_ID, TEAM_ID)).rejects.toThrow(
      ORPCError
    );
  });

  it("prefers the team-scoped role over the club-wide role", async () => {
    const { db } = buildDbMock({
      specs: [
        adminSpec,
        {
          teamId: TEAM_ID,
          roleId: "role-coach",
          name: "Coach",
          systemKey: "coach",
          permissions: ["members.manage"],
        },
      ],
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    const result = await requireTeamAccess(db, USER_ID, TEAM_ID);
    expect(result.membership.roleName).toEqual("Coach");
  });
});

describe("requireTeamPermission", () => {
  it("passes when the granting role holds the permission", async () => {
    const { db } = buildDbMock({
      specs: [adminSpec],
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    await expect(
      requireTeamPermission(db, USER_ID, TEAM_ID, "members.manage")
    ).resolves.toMatchObject({ teamId: TEAM_ID });
  });

  it("throws FORBIDDEN when the granting role lacks the permission", async () => {
    const { db } = buildDbMock({
      specs: [
        {
          teamId: TEAM_ID,
          roleId: "role-player",
          name: "Player",
          systemKey: "player",
          permissions: ["callups.respond"],
        },
      ],
      teamRow: { id: TEAM_ID, club_id: CLUB_ID },
    });
    await expect(
      requireTeamPermission(db, USER_ID, TEAM_ID, "members.manage")
    ).rejects.toThrow(ORPCError);
  });
});
