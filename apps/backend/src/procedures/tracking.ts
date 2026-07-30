/** Tracking lists: definitions, the matrix, and one cell per write (ADR-014, ADR-019). */
import { ORPCError } from "@orpc/server";
import type { Kysely, Selectable } from "kysely";
import {
  validateTrackingValue,
  type TrackingDefinition,
  type TrackingEntry,
  type TrackingValueType,
} from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database, TrackingDefinitionsTable } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";


function toDefinition(
  row: Selectable<TrackingDefinitionsTable>
): TrackingDefinition {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    valueType: row.value_type as TrackingValueType,
    sortOrder: row.sort_order,
    archived: row.archived,
  };
}

interface EntryRow {
  definition_id: string;
  member_id: string;
  value: string;
  updated_at: Date;
  updated_by: string | null;
  updated_by_name: string | null;
}

function toEntry(row: EntryRow): TrackingEntry {
  return {
    definitionId: row.definition_id,
    memberId: row.member_id,
    value: row.value,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
    updatedByName: row.updated_by_name,
  };
}

async function loadDefinition(
  db: Kysely<Database>,
  teamId: string,
  definitionId: string
): Promise<Selectable<TrackingDefinitionsTable>> {
  const row = await db
    .selectFrom("tracking_definitions")
    .selectAll()
    .where("id", "=", definitionId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Tracking list not found" });
  }
  return row;
}

/** Turns the partial unique index into a sentence a coach can act on. */
async function assertNameAvailable(
  db: Kysely<Database>,
  teamId: string,
  name: string,
  exceptId?: string
): Promise<void> {
  let query = db
    .selectFrom("tracking_definitions")
    .select("id")
    .where("team_id", "=", teamId)
    .where("name", "=", name)
    .where("archived", "=", false);
  if (exceptId !== undefined) {
    query = query.where("id", "!=", exceptId);
  }
  const clash = await query.executeTakeFirst();
  if (clash) {
    throw new ORPCError("BAD_REQUEST", {
      message: `There is already a tracking list called ${name}`,
    });
  }
}

/** Entries for a set of definitions, with the name of whoever last ticked. */
function selectEntries(db: Kysely<Database>, definitionIds: string[]) {
  return db
    .selectFrom("tracking_entries")
    // Left join: the tick outlives the account that made it.
    .leftJoin("users", "users.id", "tracking_entries.updated_by")
    .select([
      "tracking_entries.definition_id as definition_id",
      "tracking_entries.member_id as member_id",
      "tracking_entries.value as value",
      "tracking_entries.updated_at as updated_at",
      "tracking_entries.updated_by as updated_by",
      "users.name as updated_by_name",
    ])
    .where("tracking_entries.definition_id", "in", definitionIds);
}

export const listTrackingDefinitionsHandler =
  os.listTrackingDefinitions.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    let query = db
      .selectFrom("tracking_definitions")
      .selectAll()
      .where("team_id", "=", input.teamId);
    if (input.includeArchived !== true) {
      query = query.where("archived", "=", false);
    }
    const rows = await query.orderBy("sort_order").orderBy("name").execute();
    return { definitions: rows.map(toDefinition) };
  });

export const createTrackingDefinitionHandler =
  os.createTrackingDefinition.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    await assertNameAvailable(db, input.teamId, input.name);

    // Append to the end of the current ordering — a new column belongs on the
    // right of the matrix, not silently in the middle of it.
    const max = await db
      .selectFrom("tracking_definitions")
      .select((eb) => eb.fn.max("sort_order").as("max"))
      .where("team_id", "=", input.teamId)
      .executeTakeFirst();

    const inserted = await db
      .insertInto("tracking_definitions")
      .values({
        team_id: input.teamId,
        name: input.name,
        value_type: input.valueType,
        sort_order: (max?.max ?? -1) + 1,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { definition: toDefinition(inserted) };
  });

export const updateTrackingDefinitionHandler =
  os.updateTrackingDefinition.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    const existing = await loadDefinition(db, input.teamId, input.definitionId);

    if (input.name !== undefined && input.name !== existing.name) {
      await assertNameAvailable(
        db,
        input.teamId,
        input.name,
        input.definitionId
      );
    }

    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates["name"] = input.name;
    if (input.sortOrder !== undefined) updates["sort_order"] = input.sortOrder;
    if (Object.keys(updates).length === 0) {
      return { definition: toDefinition(existing) };
    }

    const updated = await db
      .updateTable("tracking_definitions")
      .set(updates)
      .where("id", "=", input.definitionId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { definition: toDefinition(updated) };
  });

export const archiveTrackingDefinitionHandler =
  os.archiveTrackingDefinition.handler(async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    const existing = await loadDefinition(db, input.teamId, input.definitionId);

    // Bringing one back has to re-check the name: another list may have taken
    // it while this one was retired.
    if (!input.archived && existing.archived) {
      await assertNameAvailable(
        db,
        input.teamId,
        existing.name,
        input.definitionId
      );
    }

    const updated = await db
      .updateTable("tracking_definitions")
      .set({ archived: input.archived })
      .where("id", "=", input.definitionId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { definition: toDefinition(updated) };
  });

export const trackingMatrixHandler = os.trackingMatrix.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    // Columns and rows are independent, so they go together.
    const [definitions, members] = await Promise.all([
      db
        .selectFrom("tracking_definitions")
        .selectAll()
        .where("team_id", "=", input.teamId)
        .where("archived", "=", false)
        .orderBy("sort_order")
        .orderBy("name")
        .execute(),
      (() => {
        // Archived members are left out: the matrix is about the squad you have.
        let query = db
          .selectFrom("members")
          .select(["id", "first_name", "last_name"])
          .where("team_id", "=", input.teamId)
          .where("archived", "=", false);
        if (input.groupId !== undefined) {
          query = query.where(
            "id",
            "in",
            db
              .selectFrom("group_members")
              .select("member_id")
              .where("group_id", "=", input.groupId)
          );
        }
        return query.orderBy("last_name").orderBy("first_name").execute();
      })(),
    ]);

    // One query for every cell, rather than one per column.
    const entries =
      definitions.length === 0
        ? []
        : await selectEntries(
            db,
            definitions.map((definition) => definition.id)
          ).execute();

    const visible = new Set(members.map((member) => member.id));

    return {
      definitions: definitions.map(toDefinition),
      members: members.map((member) => ({
        memberId: member.id,
        firstName: member.first_name,
        lastName: member.last_name,
      })),
      entries: entries.filter((row) => visible.has(row.member_id)).map(toEntry),
    };
  }
);

export const setTrackingEntryHandler = os.setTrackingEntry.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "tracking.manage");

    const definition = await loadDefinition(
      db,
      input.teamId,
      input.definitionId
    );
    if (definition.archived) {
      throw new ORPCError("BAD_REQUEST", {
        message: "That tracking list has been archived",
      });
    }

    // The member has to be in the same team — the definition id alone must not
    // be a route into another team's roster.
    const member = await db
      .selectFrom("members")
      .select("id")
      .where("id", "=", input.memberId)
      .where("team_id", "=", input.teamId)
      .executeTakeFirst();
    if (!member) {
      throw new ORPCError("NOT_FOUND", { message: "Member not found" });
    }

    if (input.value === null || input.value.trim() === "") {
      await db
        .deleteFrom("tracking_entries")
        .where("definition_id", "=", input.definitionId)
        .where("member_id", "=", input.memberId)
        .execute();
      return { entry: null };
    }

    const validation = validateTrackingValue(
      definition.value_type as TrackingValueType,
      input.value
    );
    if (!validation.ok) {
      throw new ORPCError("BAD_REQUEST", {
        message: `${definition.name}: ${validation.error}`,
      });
    }

    const now = new Date();
    await db
      .insertInto("tracking_entries")
      .values({
        definition_id: input.definitionId,
        member_id: input.memberId,
        value: validation.value,
        updated_by: user.id,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.columns(["definition_id", "member_id"]).doUpdateSet({
          value: validation.value,
          updated_by: user.id,
          updated_at: now,
        })
      )
      .execute();

    return {
      entry: {
        definitionId: input.definitionId,
        memberId: input.memberId,
        value: validation.value,
        updatedAt: now.toISOString(),
        updatedBy: user.id,
        updatedByName: user.name,
      },
    };
  }
);

export const memberTrackingHandler = os.memberTracking.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    const member = await db
      .selectFrom("members")
      .select("id")
      .where("id", "=", input.memberId)
      .where("team_id", "=", input.teamId)
      .executeTakeFirst();
    if (!member) {
      throw new ORPCError("NOT_FOUND", { message: "Member not found" });
    }

    const definitions = await db
      .selectFrom("tracking_definitions")
      .selectAll()
      .where("team_id", "=", input.teamId)
      .orderBy("sort_order")
      .orderBy("name")
      .execute();

    const entries =
      definitions.length === 0
        ? []
        : await selectEntries(
            db,
            definitions.map((definition) => definition.id)
          )
            .where("tracking_entries.member_id", "=", input.memberId)
            .execute();

    return {
      definitions: definitions.map(toDefinition),
      entries: entries.map(toEntry),
    };
  }
);
