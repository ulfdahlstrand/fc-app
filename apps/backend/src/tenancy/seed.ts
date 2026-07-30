/** Seeds a new club and team with their default configuration (ADR-005). */
import type { Kysely } from "kysely";
import {
  DEFAULT_ACTIVITY_TYPES,
  DEFAULT_ATTENDANCE_STATUSES,
} from "@fc-app/contracts";
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

/** Seeds a newly created team with its default configuration (ADR-005). */
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

  // The seeded order is the order a coach taps through at the pitch side.
  await db
    .insertInto("attendance_statuses")
    .values(
      DEFAULT_ATTENDANCE_STATUSES.map((status, index) => ({
        team_id: teamId,
        name: status.name,
        colour: status.colour,
        counts_as_present: status.countsAsPresent,
        sort_order: index,
      }))
    )
    .execute();
}
