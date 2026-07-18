import { sql, type Kysely } from "kysely";

/**
 * Invitations (issue #6, ADR-004):
 * a shareable link that grants a preset role in a club — club-wide
 * (team_id null) or scoped to one team — optionally restricted to a single
 * email. The token is stored in plaintext so managers can re-copy the link;
 * invitations are short-lived and revocable. Status is derived at read time
 * from expires_at / revoked_at / used_at.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("invitations")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("club_id", "uuid", (col) =>
      col.notNull().references("clubs.id").onDelete("cascade")
    )
    .addColumn("team_id", "uuid", (col) =>
      col.references("teams.id").onDelete("cascade")
    )
    .addColumn("role_id", "uuid", (col) =>
      col.notNull().references("roles.id").onDelete("cascade")
    )
    .addColumn("email", "text")
    .addColumn("token", "text", (col) => col.notNull().unique())
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("created_by", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("used_at", "timestamptz")
    .addColumn("used_by", "uuid", (col) =>
      col.references("users.id").onDelete("set null")
    )
    .addColumn("revoked_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("invitations_club_id_idx")
    .on("invitations")
    .column("club_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("invitations").execute();
}
