/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * Member groups (issue #10): custom, team-scoped groups ("A squad", "born
 * 2014") reusable for roster filtering, call-up squad selection, and post
 * targeting. A member can belong to several groups; deleting a group leaves
 * its members untouched (the join row is simply removed).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("groups")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("team_id", "uuid", (col) =>
      col.notNull().references("teams.id").onDelete("cascade")
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addUniqueConstraint("groups_team_name_uq", ["team_id", "name"])
    .execute();

  await db.schema
    .createTable("group_members")
    .addColumn("group_id", "uuid", (col) =>
      col.notNull().references("groups.id").onDelete("cascade")
    )
    .addColumn("member_id", "uuid", (col) =>
      col.notNull().references("members.id").onDelete("cascade")
    )
    .addPrimaryKeyConstraint("group_members_pk", ["group_id", "member_id"])
    .execute();

  await db.schema
    .createIndex("group_members_member_id_idx")
    .on("group_members")
    .column("member_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("group_members").execute();
  await db.schema.dropTable("groups").execute();
}
