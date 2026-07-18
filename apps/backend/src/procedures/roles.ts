import { ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Permission, Role } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireClubPermission } from "../tenancy/membership.js";

/** Loads every role in a club with its permissions and membership usage count. */
async function loadRoles(
  db: Kysely<Database>,
  clubId: string
): Promise<Role[]> {
  const roles = await db
    .selectFrom("roles")
    .select(["id", "club_id", "name", "system_key"])
    .where("club_id", "=", clubId)
    .orderBy("name")
    .execute();

  if (roles.length === 0) return [];

  const roleIds = roles.map((role) => role.id);

  const permissionRows = await db
    .selectFrom("role_permissions")
    .select(["role_id", "permission"])
    .where("role_id", "in", roleIds)
    .execute();

  const counts = await db
    .selectFrom("memberships")
    .select((eb) => ["role_id", eb.fn.countAll<number>().as("count")])
    .where("role_id", "in", roleIds)
    .groupBy("role_id")
    .execute();

  const permissionsByRole = new Map<string, Permission[]>();
  for (const row of permissionRows) {
    const list = permissionsByRole.get(row.role_id) ?? [];
    list.push(row.permission as Permission);
    permissionsByRole.set(row.role_id, list);
  }

  const countByRole = new Map<string, number>();
  for (const row of counts) {
    countByRole.set(row.role_id, Number(row.count));
  }

  return roles.map((role) => ({
    id: role.id,
    clubId: role.club_id,
    name: role.name,
    systemKey: role.system_key,
    permissions: permissionsByRole.get(role.id) ?? [],
    memberCount: countByRole.get(role.id) ?? 0,
  }));
}

async function loadRole(
  db: Kysely<Database>,
  clubId: string,
  roleId: string
): Promise<Role> {
  const roles = await loadRoles(db, clubId);
  const role = roles.find((r) => r.id === roleId);
  if (!role) {
    throw new ORPCError("NOT_FOUND", { message: "Role not found" });
  }
  return role;
}

/** Replaces a role's permission rows with the given set, inside a transaction. */
async function setRolePermissions(
  db: Kysely<Database>,
  roleId: string,
  permissions: Permission[]
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom("role_permissions")
      .where("role_id", "=", roleId)
      .execute();
    if (permissions.length > 0) {
      await trx
        .insertInto("role_permissions")
        .values(permissions.map((permission) => ({ role_id: roleId, permission })))
        .execute();
    }
  });
}

export const listRolesHandler = os.listRoles.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    await requireClubPermission(getDb(), user.id, input.clubId, "settings.club");
    return { roles: await loadRoles(getDb(), input.clubId) };
  }
);

export const createRoleHandler = os.createRole.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireClubPermission(db, user.id, input.clubId, "settings.club");

    const inserted = await db
      .insertInto("roles")
      .values({ club_id: input.clubId, name: input.name, system_key: null })
      .returning("id")
      .executeTakeFirstOrThrow()
      .catch(() => {
        throw new ORPCError("CONFLICT", {
          message: "A role with that name already exists",
        });
      });

    await setRolePermissions(db, inserted.id, input.permissions);
    return { role: await loadRole(db, input.clubId, inserted.id) };
  }
);

export const updateRoleHandler = os.updateRole.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireClubPermission(db, user.id, input.clubId, "settings.club");

    const existing = await loadRole(db, input.clubId, input.roleId);

    // The admin role is immutable — it must always hold every permission so a
    // club cannot lock itself out of settings.club.
    if (existing.systemKey === "admin") {
      throw new ORPCError("FORBIDDEN", {
        message: "The Admin role cannot be modified",
      });
    }

    if (input.name !== undefined) {
      await db
        .updateTable("roles")
        .set({ name: input.name })
        .where("id", "=", input.roleId)
        .execute()
        .catch(() => {
          throw new ORPCError("CONFLICT", {
            message: "A role with that name already exists",
          });
        });
    }

    if (input.permissions !== undefined) {
      await setRolePermissions(db, input.roleId, input.permissions);
    }

    return { role: await loadRole(db, input.clubId, input.roleId) };
  }
);

export const deleteRoleHandler = os.deleteRole.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireClubPermission(db, user.id, input.clubId, "settings.club");

    const existing = await loadRole(db, input.clubId, input.roleId);

    if (existing.systemKey !== null) {
      throw new ORPCError("FORBIDDEN", {
        message: "System roles cannot be deleted",
      });
    }

    if (existing.memberCount > 0) {
      throw new ORPCError("CONFLICT", {
        message: "Reassign members before deleting this role",
      });
    }

    await db.deleteFrom("roles").where("id", "=", input.roleId).execute();
    return { deleted: true as const };
  }
);
