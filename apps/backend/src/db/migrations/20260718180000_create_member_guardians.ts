/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/** Guardians (issue #9): links a user account to a member. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("member_guardians")
    .addColumn("member_id", "uuid", (col) =>
      col.notNull().references("members.id").onDelete("cascade")
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("relation", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addPrimaryKeyConstraint("member_guardians_pk", ["member_id", "user_id"])
    .execute();

  await db.schema
    .createIndex("member_guardians_user_id_idx")
    .on("member_guardians")
    .column("user_id")
    .execute();

  await db.schema
    .alterTable("invitations")
    .addColumn("member_id", "uuid", (col) =>
      col.references("members.id").onDelete("cascade")
    )
    .addColumn("relation", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("invitations").dropColumn("relation").execute();
  await db.schema.alterTable("invitations").dropColumn("member_id").execute();
  await db.schema.dropTable("member_guardians").execute();
}
