import { ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Group } from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

async function toGroup(
  db: Kysely<Database>,
  row: { id: string; team_id: string; name: string }
): Promise<Group> {
  const count = await db
    .selectFrom("group_members")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("group_id", "=", row.id)
    .executeTakeFirst();
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    memberCount: Number(count?.count ?? 0),
  };
}

/** Confirms the group belongs to the team; throws NOT_FOUND otherwise. */
async function loadGroup(
  db: Kysely<Database>,
  teamId: string,
  groupId: string
): Promise<{ id: string; team_id: string; name: string }> {
  const row = await db
    .selectFrom("groups")
    .select(["id", "team_id", "name"])
    .where("id", "=", groupId)
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Group not found" });
  }
  return row;
}

export const listGroupsHandler = os.listGroups.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    const rows = await db
      .selectFrom("groups")
      .select(["id", "team_id", "name"])
      .where("team_id", "=", input.teamId)
      .orderBy("name")
      .execute();
    return { groups: await Promise.all(rows.map((row) => toGroup(db, row))) };
  }
);

export const createGroupHandler = os.createGroup.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.manage");

    const inserted = await db
      .insertInto("groups")
      .values({ team_id: input.teamId, name: input.name })
      .returning(["id", "team_id", "name"])
      .executeTakeFirstOrThrow()
      .catch(() => {
        throw new ORPCError("CONFLICT", {
          message: "A group with that name already exists",
        });
      });
    return { group: await toGroup(db, inserted) };
  }
);

export const renameGroupHandler = os.renameGroup.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.manage");
    await loadGroup(db, input.teamId, input.groupId);

    const updated = await db
      .updateTable("groups")
      .set({ name: input.name })
      .where("id", "=", input.groupId)
      .where("team_id", "=", input.teamId)
      .returning(["id", "team_id", "name"])
      .executeTakeFirstOrThrow()
      .catch(() => {
        throw new ORPCError("CONFLICT", {
          message: "A group with that name already exists",
        });
      });
    return { group: await toGroup(db, updated) };
  }
);

export const deleteGroupHandler = os.deleteGroup.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.manage");
    await loadGroup(db, input.teamId, input.groupId);

    // Deleting a group never touches its members — group_members rows are
    // just join rows, cascaded away with the group.
    await db.deleteFrom("groups").where("id", "=", input.groupId).execute();
    return { deleted: true as const };
  }
);

export const listGroupMembersHandler = os.listGroupMembers.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");
    await loadGroup(db, input.teamId, input.groupId);

    const rows = await db
      .selectFrom("group_members")
      .select("member_id")
      .where("group_id", "=", input.groupId)
      .execute();
    return { memberIds: rows.map((row) => row.member_id) };
  }
);

export const setGroupMembersHandler = os.setGroupMembers.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.manage");
    await loadGroup(db, input.teamId, input.groupId);

    // Every member id must belong to this team — never trust client ids
    // to cross tenant boundaries.
    const uniqueIds = [...new Set(input.memberIds)];
    if (uniqueIds.length > 0) {
      const validMembers = await db
        .selectFrom("members")
        .select("id")
        .where("id", "in", uniqueIds)
        .where("team_id", "=", input.teamId)
        .execute();
      if (validMembers.length !== uniqueIds.length) {
        throw new ORPCError("BAD_REQUEST", {
          message: "One or more members do not belong to this team",
        });
      }
    }

    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("group_members")
        .where("group_id", "=", input.groupId)
        .execute();
      if (uniqueIds.length > 0) {
        await trx
          .insertInto("group_members")
          .values(
            uniqueIds.map((memberId) => ({
              group_id: input.groupId,
              member_id: memberId,
            }))
          )
          .execute();
      }
    });

    return { memberIds: uniqueIds };
  }
);

export const listMemberGroupsHandler = os.listMemberGroups.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.view");

    // Member must belong to the team.
    const member = await db
      .selectFrom("members")
      .select("id")
      .where("id", "=", input.memberId)
      .where("team_id", "=", input.teamId)
      .executeTakeFirst();
    if (!member) {
      throw new ORPCError("NOT_FOUND", { message: "Member not found" });
    }

    const rows = await db
      .selectFrom("group_members")
      .innerJoin("groups", "groups.id", "group_members.group_id")
      .select(["groups.id", "groups.team_id", "groups.name"])
      .where("group_members.member_id", "=", input.memberId)
      .orderBy("groups.name")
      .execute();
    return { groups: await Promise.all(rows.map((row) => toGroup(db, row))) };
  }
);
