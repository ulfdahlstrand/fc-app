/** Tenant scoping: every procedure resolves membership before touching data (ADR-003, ADR-011). */
import { ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Permission } from "@fc-app/contracts";
import type { Database } from "../db/types.js";

export interface Membership {
  id: string;
  userId: string;
  clubId: string;
  teamId: string | null;
  roleId: string;
  roleName: string;
  roleSystemKey: string | null;
  permissions: Permission[];
}

/** All membership rows the user holds in the club (may be empty), with permissions. */
export async function getClubMemberships(
  db: Kysely<Database>,
  userId: string,
  clubId: string
): Promise<Membership[]> {
  const rows = await db
    .selectFrom("memberships")
    .innerJoin("roles", "roles.id", "memberships.role_id")
    .select([
      "memberships.id",
      "memberships.user_id",
      "memberships.club_id",
      "memberships.team_id",
      "memberships.role_id",
      "roles.name as role_name",
      "roles.system_key as role_system_key",
    ])
    .where("memberships.user_id", "=", userId)
    .where("memberships.club_id", "=", clubId)
    .execute();

  if (rows.length === 0) return [];

  const permissionRows = await db
    .selectFrom("role_permissions")
    .select(["role_id", "permission"])
    .where(
      "role_id",
      "in",
      rows.map((row) => row.role_id)
    )
    .execute();

  const permissionsByRole = new Map<string, Permission[]>();
  for (const row of permissionRows) {
    const list = permissionsByRole.get(row.role_id) ?? [];
    list.push(row.permission as Permission);
    permissionsByRole.set(row.role_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    clubId: row.club_id,
    teamId: row.team_id,
    roleId: row.role_id,
    roleName: row.role_name,
    roleSystemKey: row.role_system_key,
    permissions: permissionsByRole.get(row.role_id) ?? [],
  }));
}

/**
 * Returns the caller's memberships in the club, or throws FORBIDDEN.
 * Non-members must not be able to distinguish "club exists" from "no access".
 */
export async function requireMembership(
  db: Kysely<Database>,
  userId: string,
  clubId: string
): Promise<Membership[]> {
  const memberships = await getClubMemberships(db, userId, clubId);
  if (memberships.length === 0) {
    throw new ORPCError("FORBIDDEN", {
      message: "Not a member of this club",
    });
  }
  return memberships;
}

/**
 * Requires that the caller holds `permission` somewhere in the club — via
 * the club-wide role or any team-scoped role. Returns the caller's
 * memberships so the procedure can narrow further if needed.
 */
export async function requireClubPermission(
  db: Kysely<Database>,
  userId: string,
  clubId: string,
  permission: Permission
): Promise<Membership[]> {
  const memberships = await requireMembership(db, userId, clubId);
  const granted = memberships.some((m) => m.permissions.includes(permission));
  if (!granted) {
    throw new ORPCError("FORBIDDEN", {
      message: `Missing permission: ${permission}`,
    });
  }
  return memberships;
}

/**
 * Returns the team with the membership that grants access to it, otherwise
 * throws FORBIDDEN. The tenant check goes through the team's own club_id —
 * never a client-supplied club id. The team-scoped membership wins over the
 * club-wide one when both exist, so team-specific roles apply.
 */
export async function requireTeamAccess(
  db: Kysely<Database>,
  userId: string,
  teamId: string
): Promise<{ teamId: string; clubId: string; membership: Membership }> {
  const team = await db
    .selectFrom("teams")
    .select(["id", "club_id"])
    .where("id", "=", teamId)
    .executeTakeFirst();

  if (!team) {
    throw new ORPCError("FORBIDDEN", { message: "No access to this team" });
  }

  const memberships = await requireMembership(db, userId, team.club_id);
  const membership =
    memberships.find((row) => row.teamId === team.id) ??
    memberships.find((row) => row.teamId === null);

  if (!membership) {
    throw new ORPCError("FORBIDDEN", { message: "No access to this team" });
  }

  return { teamId: team.id, clubId: team.club_id, membership };
}

/** Like requireTeamAccess, but also requires the granting membership's role to hold `permission`. */
export async function requireTeamPermission(
  db: Kysely<Database>,
  userId: string,
  teamId: string,
  permission: Permission
): Promise<{ teamId: string; clubId: string; membership: Membership }> {
  const access = await requireTeamAccess(db, userId, teamId);
  if (!access.membership.permissions.includes(permission)) {
    throw new ORPCError("FORBIDDEN", {
      message: `Missing permission: ${permission}`,
    });
  }
  return access;
}
