import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { DEFAULT_ROLES } from "./roles.js";

/**
 * Seeds a club with its default roles (ADR-005) and returns the id of the
 * admin role so the creator's membership can be attached to it.
 *
 * Called once at club creation, inside the same transaction.
 */
export async function seedClubRoles(
  db: Kysely<Database>,
  clubId: string
): Promise<{ adminRoleId: string }> {
  let adminRoleId: string | undefined;

  for (const role of DEFAULT_ROLES) {
    const inserted = await db
      .insertInto("roles")
      .values({
        club_id: clubId,
        name: role.name,
        system_key: role.systemKey,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    if (role.permissions.length > 0) {
      await db
        .insertInto("role_permissions")
        .values(
          role.permissions.map((permission) => ({
            role_id: inserted.id,
            permission,
          }))
        )
        .execute();
    }

    if (role.systemKey === "admin") {
      adminRoleId = inserted.id;
    }
  }

  if (!adminRoleId) {
    throw new Error("[seed] Admin role was not created");
  }

  return { adminRoleId };
}

/**
 * Seeds a newly created team with its default configuration (ADR-005).
 *
 * Currently a no-op hook. Later issues extend it:
 * - #11: activity types (Training, Match)
 * - #14: attendance statuses (Present, Absent, Ill)
 */
export async function seedTeamDefaults(
  _db: Kysely<Database>,
  _teamId: string
): Promise<void> {
  // Intentionally empty — see the issue list above.
}
