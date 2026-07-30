/** Roster CRUD. Members are archived, never deleted (ADR-014). */
import { ORPCError } from "@orpc/server";
import type { Kysely, Selectable } from "kysely";
import type { Member } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database, MembersTable } from "../db/types.js";
import { loadMemberValues } from "../members/values.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

function toMember(
  row: Selectable<MembersTable>,
  customFields: Record<string, string>
): Member {
  return {
    id: row.id,
    teamId: row.team_id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthYear: row.birth_year,
    email: row.email,
    phone: row.phone,
    archived: row.archived,
    customFields,
  };
}

/** Loads a member, scoped to the team; throws NOT_FOUND otherwise. */
async function loadMember(
  db: Kysely<Database>,
  teamId: string,
  memberId: string
): Promise<Member> {
  const row = await db
    .selectFrom("members")
    .selectAll()
    .where("id", "=", memberId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Member not found" });
  }
  const values = await loadMemberValues(db, [memberId]);
  return toMember(row, values.get(memberId) ?? {});
}

export const listMembersHandler = os.listMembers.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    let query = db
      .selectFrom("members")
      .selectAll()
      .where("team_id", "=", input.teamId);

    if (input.includeArchived !== true) {
      query = query.where("archived", "=", false);
    }

    const search = input.search?.trim();
    if (search) {
      const pattern = `%${search.replace(/[%_]/g, (c) => `\\${c}`)}%`;
      query = query.where((eb) =>
        eb.or([
          eb("first_name", "ilike", pattern),
          eb("last_name", "ilike", pattern),
        ])
      );
    }

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

    const rows = await query
      .orderBy("last_name")
      .orderBy("first_name")
      .execute();
    const values = await loadMemberValues(
      db,
      rows.map((row) => row.id)
    );
    return {
      members: rows.map((row) => toMember(row, values.get(row.id) ?? {})),
    };
  }
);

export const getMemberHandler = os.getMember.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");
    return { member: await loadMember(db, input.teamId, input.memberId) };
  }
);

export const createMemberHandler = os.createMember.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.manage");

    const inserted = await db
      .insertInto("members")
      .values({
        team_id: input.teamId,
        first_name: input.firstName,
        last_name: input.lastName,
        birth_year: input.birthYear ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { member: toMember(inserted, {}) };
  }
);

export const updateMemberHandler = os.updateMember.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.manage");

    // Ensure the member belongs to the team before updating.
    await loadMember(db, input.teamId, input.memberId);

    const updates: Partial<{
      first_name: string;
      last_name: string;
      birth_year: number | null;
      email: string | null;
      phone: string | null;
      updated_at: Date;
    }> = { updated_at: new Date() };
    if (input.firstName !== undefined) updates.first_name = input.firstName;
    if (input.lastName !== undefined) updates.last_name = input.lastName;
    if (input.birthYear !== undefined) updates.birth_year = input.birthYear;
    if (input.email !== undefined) updates.email = input.email;
    if (input.phone !== undefined) updates.phone = input.phone;

    const updated = await db
      .updateTable("members")
      .set(updates)
      .where("id", "=", input.memberId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const values = await loadMemberValues(db, [input.memberId]);
    return { member: toMember(updated, values.get(input.memberId) ?? {}) };
  }
);

export const setMemberArchivedHandler = os.setMemberArchived.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.manage");

    await loadMember(db, input.teamId, input.memberId);

    const updated = await db
      .updateTable("members")
      .set({ archived: input.archived, updated_at: new Date() })
      .where("id", "=", input.memberId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const values = await loadMemberValues(db, [input.memberId]);
    return { member: toMember(updated, values.get(input.memberId) ?? {}) };
  }
);
