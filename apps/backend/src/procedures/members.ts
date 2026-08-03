/** Roster CRUD. Members are archived, never deleted (ADR-014). */
import { ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Member, Permission } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { loadPersonalIds, setPersonalId } from "../members/personal-id.js";
import { toMember } from "../members/to-member.js";
import { loadMemberValues } from "../members/values.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

/** Loads a member, scoped to the team; throws NOT_FOUND otherwise. */
async function loadMember(
  db: Kysely<Database>,
  teamId: string,
  memberId: string,
  permissions: Permission[]
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
  const personalIds = await loadPersonalIds(db, [memberId], permissions);
  return toMember(
    row,
    values.get(memberId) ?? {},
    personalIds.get(memberId) ?? null
  );
}

export const listMembersHandler = os.listMembers.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const access = await requireTeamPermission(
      db,
      user.id,
      input.teamId,
      "members.view"
    );

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
    const memberIds = rows.map((row) => row.id);
    const values = await loadMemberValues(db, memberIds);
    const personalIds = await loadPersonalIds(
      db,
      memberIds,
      access.membership.permissions
    );
    return {
      members: rows.map((row) =>
        toMember(row, values.get(row.id) ?? {}, personalIds.get(row.id) ?? null)
      ),
    };
  }
);

export const getMemberHandler = os.getMember.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const access = await requireTeamPermission(
      db,
      user.id,
      input.teamId,
      "members.view"
    );
    return {
      member: await loadMember(
        db,
        input.teamId,
        input.memberId,
        access.membership.permissions
      ),
    };
  }
);

export const createMemberHandler = os.createMember.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const access = await requireTeamPermission(
      db,
      user.id,
      input.teamId,
      "members.manage"
    );

    // In one transaction: a rejected personnummer must not leave a member
    // behind, and a member must not exist momentarily without one.
    const row = await db.transaction().execute(async (trx) => {
      const inserted = await trx
        .insertInto("members")
        .values({
          team_id: input.teamId,
          first_name: input.firstName,
          last_name: input.lastName,
          birth_year: input.birthYear ?? null,
          birth_date: null,
          external_ref: input.externalRef ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const derived = await setPersonalId(trx, {
        memberId: inserted.id,
        teamId: input.teamId,
        raw: input.personalId ?? null,
      });
      if (!derived) return inserted;

      // The number is the identity, so it wins over a birth year typed by hand.
      return await trx
        .updateTable("members")
        .set({ birth_date: derived.birthDate, birth_year: derived.birthYear })
        .where("id", "=", inserted.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    });

    const personalIds = await loadPersonalIds(
      db,
      [row.id],
      access.membership.permissions
    );
    return { member: toMember(row, {}, personalIds.get(row.id) ?? null) };
  }
);

export const updateMemberHandler = os.updateMember.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const access = await requireTeamPermission(
      db,
      user.id,
      input.teamId,
      "members.manage"
    );

    // Ensure the member belongs to the team before updating.
    await loadMember(
      db,
      input.teamId,
      input.memberId,
      access.membership.permissions
    );

    const updated = await db.transaction().execute(async (trx) => {
      const updates: Partial<{
        first_name: string;
        last_name: string;
        birth_year: number | null;
        birth_date: string | null;
        external_ref: string | null;
        email: string | null;
        phone: string | null;
        updated_at: Date;
      }> = { updated_at: new Date() };
      if (input.firstName !== undefined) updates.first_name = input.firstName;
      if (input.lastName !== undefined) updates.last_name = input.lastName;
      if (input.birthYear !== undefined) updates.birth_year = input.birthYear;
      if (input.email !== undefined) updates.email = input.email;
      if (input.phone !== undefined) updates.phone = input.phone;
      if (input.externalRef !== undefined) {
        updates.external_ref = input.externalRef;
      }

      if (input.personalId !== undefined) {
        const derived = await setPersonalId(trx, {
          memberId: input.memberId,
          teamId: input.teamId,
          raw: input.personalId,
        });
        // Clearing the number leaves the birth date alone: it is still the last
        // thing anyone knew, and it is writable in its own right.
        if (derived) {
          updates.birth_date = derived.birthDate;
          updates.birth_year = derived.birthYear;
        }
      }

      return await trx
        .updateTable("members")
        .set(updates)
        .where("id", "=", input.memberId)
        .where("team_id", "=", input.teamId)
        .returningAll()
        .executeTakeFirstOrThrow();
    });

    const values = await loadMemberValues(db, [input.memberId]);
    const personalIds = await loadPersonalIds(
      db,
      [input.memberId],
      access.membership.permissions
    );
    return {
      member: toMember(
        updated,
        values.get(input.memberId) ?? {},
        personalIds.get(input.memberId) ?? null
      ),
    };
  }
);

export const setMemberArchivedHandler = os.setMemberArchived.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    const access = await requireTeamPermission(
      db,
      user.id,
      input.teamId,
      "members.manage"
    );

    await loadMember(
      db,
      input.teamId,
      input.memberId,
      access.membership.permissions
    );

    const updated = await db
      .updateTable("members")
      .set({ archived: input.archived, updated_at: new Date() })
      .where("id", "=", input.memberId)
      .where("team_id", "=", input.teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const values = await loadMemberValues(db, [input.memberId]);
    const personalIds = await loadPersonalIds(
      db,
      [input.memberId],
      access.membership.permissions
    );
    return {
      member: toMember(
        updated,
        values.get(input.memberId) ?? {},
        personalIds.get(input.memberId) ?? null
      ),
    };
  }
);
