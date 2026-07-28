import { ORPCError } from "@orpc/server";
import type { Kysely, Selectable } from "kysely";
import type { ActivityColour, ActivityType } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { ActivityTypesTable, Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

function toActivityType(row: Selectable<ActivityTypesTable>): ActivityType {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    colour: row.colour as ActivityColour,
    supportsCallUps: row.supports_call_ups,
    sortOrder: row.sort_order,
    archived: row.archived,
  };
}

async function loadActivityType(
  db: Kysely<Database>,
  teamId: string,
  activityTypeId: string
): Promise<Selectable<ActivityTypesTable>> {
  const row = await db
    .selectFrom("activity_types")
    .selectAll()
    .where("id", "=", activityTypeId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Activity type not found" });
  }
  return row;
}

/**
 * Rejects a name already used by another *active* type in the same team. The
 * partial unique index enforces this in the database as well; this check turns
 * the constraint violation into a readable message.
 */
async function assertNameAvailable(
  db: Kysely<Database>,
  teamId: string,
  name: string,
  excludeId?: string
): Promise<void> {
  let query = db
    .selectFrom("activity_types")
    .select("id")
    .where("team_id", "=", teamId)
    .where("name", "=", name)
    .where("archived", "=", false);
  if (excludeId !== undefined) {
    query = query.where("id", "!=", excludeId);
  }
  const clash = await query.executeTakeFirst();
  if (clash) {
    throw new ORPCError("BAD_REQUEST", {
      message: `There is already an activity type called ${name}`,
    });
  }
}

export const listActivityTypesHandler = os.listActivityTypes.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    // Rendering the calendar needs the types, so members.view is enough to
    // read them; only settings.team may change them.
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    let query = db
      .selectFrom("activity_types")
      .selectAll()
      .where("team_id", "=", input.teamId);
    if (input.includeArchived !== true) {
      query = query.where("archived", "=", false);
    }
    const rows = await query.orderBy("sort_order").orderBy("name").execute();
    return { activityTypes: rows.map(toActivityType) };
  }
);

export const createActivityTypeHandler = os.createActivityType.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    await assertNameAvailable(db, input.teamId, input.name);

    // Append to the end of the current ordering.
    const max = await db
      .selectFrom("activity_types")
      .select((eb) => eb.fn.max("sort_order").as("max"))
      .where("team_id", "=", input.teamId)
      .executeTakeFirst();
    const sortOrder = (max?.max ?? -1) + 1;

    const inserted = await db
      .insertInto("activity_types")
      .values({
        team_id: input.teamId,
        name: input.name,
        colour: input.colour ?? "neutral",
        supports_call_ups: input.supportsCallUps ?? false,
        sort_order: sortOrder,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { activityType: toActivityType(inserted) };
  }
);

export const updateActivityTypeHandler = os.updateActivityType.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    const existing = await loadActivityType(
      db,
      input.teamId,
      input.activityTypeId
    );

    const updates: Record<string, unknown> = {};
    if (input.name !== undefined && input.name !== existing.name) {
      await assertNameAvailable(
        db,
        input.teamId,
        input.name,
        input.activityTypeId
      );
      updates["name"] = input.name;
    }
    if (input.colour !== undefined) updates["colour"] = input.colour;
    if (input.supportsCallUps !== undefined) {
      updates["supports_call_ups"] = input.supportsCallUps;
    }
    if (input.sortOrder !== undefined) updates["sort_order"] = input.sortOrder;

    if (Object.keys(updates).length === 0) {
      return { activityType: toActivityType(existing) };
    }

    const updated = await db
      .updateTable("activity_types")
      .set(updates)
      .where("id", "=", input.activityTypeId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { activityType: toActivityType(updated) };
  }
);

export const archiveActivityTypeHandler = os.archiveActivityType.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    const existing = await loadActivityType(
      db,
      input.teamId,
      input.activityTypeId
    );

    // Un-archiving can collide with a type created under the same name while
    // this one was retired.
    if (!input.archived && existing.archived) {
      await assertNameAvailable(
        db,
        input.teamId,
        existing.name,
        input.activityTypeId
      );
    }

    const updated = await db
      .updateTable("activity_types")
      .set({ archived: input.archived })
      .where("id", "=", input.activityTypeId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { activityType: toActivityType(updated) };
  }
);
