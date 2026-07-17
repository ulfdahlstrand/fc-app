import { sql, type Kysely } from "kysely";

/**
 * Multi-tenancy foundation (issue #4, ADR-003):
 * - clubs:       the tenant root
 * - teams:       belong to a club; nearly all domain data will hang off teams
 * - memberships: connect a user to a club — either club-wide (team_id null)
 *                or scoped to one team. A user can hold several team-scoped
 *                memberships in the same club (e.g. player in Team A, coach
 *                in Team B); the UNIQUE NULLS NOT DISTINCT constraint allows
 *                that while capping club-wide rows at one per user+club and
 *                team rows at one per user+team. `role` is a plain text
 *                placeholder until the configurable role system (#5)
 *                replaces it with a role_id.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("clubs")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createTable("teams")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("club_id", "uuid", (col) =>
      col.notNull().references("clubs.id").onDelete("cascade")
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("teams_club_id_idx")
    .on("teams")
    .column("club_id")
    .execute();

  await db.schema
    .createTable("memberships")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("club_id", "uuid", (col) =>
      col.notNull().references("clubs.id").onDelete("cascade")
    )
    .addColumn("team_id", "uuid", (col) =>
      col.references("teams.id").onDelete("cascade")
    )
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addUniqueConstraint(
      "memberships_user_club_team_uq",
      ["user_id", "club_id", "team_id"],
      (constraint) => constraint.nullsNotDistinct()
    )
    .execute();

  await db.schema
    .createIndex("memberships_user_id_idx")
    .on("memberships")
    .column("user_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("memberships").execute();
  await db.schema.dropTable("teams").execute();
  await db.schema.dropTable("clubs").execute();
}
