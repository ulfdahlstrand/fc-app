import type { Kysely } from "kysely";
import { DEFAULT_ACTIVITY_TYPES } from "@fc-app/contracts";
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
 * Seeds the default activity types (#11). Later issues extend it:
 * - #14: attendance statuses (Present, Absent, Ill)
 */
export async function seedTeamDefaults(
  db: Kysely<Database>,
  teamId: string
): Promise<void> {
  await db
    .insertInto("activity_types")
    .values(
      DEFAULT_ACTIVITY_TYPES.map((type, index) => ({
        team_id: teamId,
        name: type.name,
        colour: type.colour,
        supports_call_ups: type.supportsCallUps,
        sort_order: index,
      }))
    )
    .execute();
}
