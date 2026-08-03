/** Custom field definitions and values (ADR-005, ADR-010). */
import { ORPCError } from "@orpc/server";
import type { Kysely, Selectable } from "kysely";
import {
  validateMemberFieldValue,
  type MemberFieldDefinition,
  type MemberFieldType,
} from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database, MemberFieldDefinitionsTable } from "../db/types.js";
import { loadPersonalIds } from "../members/personal-id.js";
import { toMember } from "../members/to-member.js";
import { loadMemberValues } from "../members/values.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

function toDefinition(
  row: Selectable<MemberFieldDefinitionsTable>
): MemberFieldDefinition {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    fieldType: row.field_type as MemberFieldType,
    options: row.options,
    required: row.required,
    sortOrder: row.sort_order,
    archived: row.archived,
  };
}

async function loadDefinition(
  db: Kysely<Database>,
  teamId: string,
  fieldId: string
): Promise<Selectable<MemberFieldDefinitionsTable>> {
  const row = await db
    .selectFrom("member_field_definitions")
    .selectAll()
    .where("id", "=", fieldId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Field not found" });
  }
  return row;
}

export const listMemberFieldsHandler = os.listMemberFields.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    // Rendering the roster/detail needs the definitions, so members.view is
    // enough to read them; only settings.team may change them.
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    let query = db
      .selectFrom("member_field_definitions")
      .selectAll()
      .where("team_id", "=", input.teamId);
    if (input.includeArchived !== true) {
      query = query.where("archived", "=", false);
    }
    const rows = await query.orderBy("sort_order").orderBy("name").execute();
    return { fields: rows.map(toDefinition) };
  }
);

export const createMemberFieldHandler = os.createMemberField.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    if (input.fieldType === "select" && (input.options ?? []).length === 0) {
      throw new ORPCError("BAD_REQUEST", {
        message: "A select field needs at least one option",
      });
    }

    // Append to the end of the current ordering.
    const max = await db
      .selectFrom("member_field_definitions")
      .select((eb) => eb.fn.max("sort_order").as("max"))
      .where("team_id", "=", input.teamId)
      .executeTakeFirst();
    const sortOrder = (max?.max ?? -1) + 1;

    const inserted = await db
      .insertInto("member_field_definitions")
      .values({
        team_id: input.teamId,
        name: input.name,
        field_type: input.fieldType,
        options: JSON.stringify(
          input.fieldType === "select" ? (input.options ?? []) : []
        ),
        required: input.required ?? false,
        sort_order: sortOrder,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { field: toDefinition(inserted) };
  }
);

export const updateMemberFieldHandler = os.updateMemberField.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");

    const existing = await loadDefinition(db, input.teamId, input.fieldId);

    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates["name"] = input.name;
    if (input.required !== undefined) updates["required"] = input.required;
    if (input.sortOrder !== undefined) updates["sort_order"] = input.sortOrder;
    if (input.options !== undefined) {
      if (existing.field_type !== "select") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Only select fields have options",
        });
      }
      if (input.options.length === 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A select field needs at least one option",
        });
      }
      updates["options"] = JSON.stringify(input.options);
    }

    if (Object.keys(updates).length === 0) {
      return { field: toDefinition(existing) };
    }

    const updated = await db
      .updateTable("member_field_definitions")
      .set(updates)
      .where("id", "=", input.fieldId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { field: toDefinition(updated) };
  }
);

export const archiveMemberFieldHandler = os.archiveMemberField.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "settings.team");
    await loadDefinition(db, input.teamId, input.fieldId);

    const updated = await db
      .updateTable("member_field_definitions")
      .set({ archived: input.archived })
      .where("id", "=", input.fieldId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { field: toDefinition(updated) };
  }
);

export const setMemberFieldValuesHandler = os.setMemberFieldValues.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const access = await requireTeamPermission(
      db,
      user.id,
      input.teamId,
      "members.manage"
    );

    // Member must belong to the team.
    const member = await db
      .selectFrom("members")
      .selectAll()
      .where("id", "=", input.memberId)
      .where("team_id", "=", input.teamId)
      .executeTakeFirst();
    if (!member) {
      throw new ORPCError("NOT_FOUND", { message: "Member not found" });
    }

    // Load the team's active definitions to validate against.
    const definitions = await db
      .selectFrom("member_field_definitions")
      .selectAll()
      .where("team_id", "=", input.teamId)
      .where("archived", "=", false)
      .execute();
    const byId = new Map(definitions.map((d) => [d.id, d]));

    const toUpsert: { definition_id: string; value: string }[] = [];
    const toClear: string[] = [];

    for (const [definitionId, rawValue] of Object.entries(input.values)) {
      const definition = byId.get(definitionId);
      if (!definition) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Unknown field: ${definitionId}`,
        });
      }
      if (rawValue === null || rawValue.trim() === "") {
        toClear.push(definitionId);
        continue;
      }
      const validation = validateMemberFieldValue(
        {
          fieldType: definition.field_type as MemberFieldType,
          options: definition.options,
        },
        rawValue
      );
      if (!validation.ok) {
        throw new ORPCError("BAD_REQUEST", {
          message: `${definition.name}: ${validation.error}`,
        });
      }
      toUpsert.push({ definition_id: definitionId, value: validation.value });
    }

    await db.transaction().execute(async (trx) => {
      if (toClear.length > 0) {
        await trx
          .deleteFrom("member_field_values")
          .where("member_id", "=", input.memberId)
          .where("definition_id", "in", toClear)
          .execute();
      }
      for (const entry of toUpsert) {
        await trx
          .insertInto("member_field_values")
          .values({
            member_id: input.memberId,
            definition_id: entry.definition_id,
            value: entry.value,
          })
          .onConflict((oc) =>
            oc
              .columns(["member_id", "definition_id"])
              .doUpdateSet({ value: entry.value })
          )
          .execute();
      }
    });

    const values = await loadMemberValues(db, [input.memberId]);
    const personalIds = await loadPersonalIds(
      db,
      [input.memberId],
      access.membership.permissions
    );
    return {
      member: toMember(
        member,
        values.get(input.memberId) ?? {},
        personalIds.get(input.memberId) ?? null
      ),
    };
  }
);
