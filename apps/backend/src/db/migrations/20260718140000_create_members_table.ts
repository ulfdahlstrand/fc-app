/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/** Members (issue #7): roster persons scoped to a team. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("members")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("team_id", "uuid", (col) =>
      col.notNull().references("teams.id").onDelete("cascade")
    )
    .addColumn("first_name", "text", (col) => col.notNull())
    .addColumn("last_name", "text", (col) => col.notNull())
    .addColumn("birth_year", "integer")
    .addColumn("email", "text")
    .addColumn("phone", "text")
    .addColumn("archived", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("members_team_id_idx")
    .on("members")
    .column("team_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("members").execute();
}
