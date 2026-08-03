/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * Member identity for the SportAdmin import (#62, ADR-022):
 *
 * - `member_personal_ids` holds the personnummer in a table of its own, so a
 *   `selectAll()` on the roster can never carry it along. What you did not
 *   join, you cannot leak.
 * - `members.birth_date` is derived from it, and `members.external_ref` keeps
 *   the exporting system's own key when there is one. Both are matching keys.
 * - `member_contacts` holds guardians who have no account yet — the export's
 *   `Målsman` columns, with their names and phone numbers intact.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("members")
    .addColumn("birth_date", "date")
    .addColumn("external_ref", "text")
    .execute();

  await db.schema
    .alterTable("members")
    .addUniqueConstraint("members_team_external_ref_uq", [
      "team_id",
      "external_ref",
    ])
    .execute();

  // Exists only so member_personal_ids can point at (id, team_id) as a unit,
  // which is what keeps its denormalised team_id honest.
  await db.schema
    .alterTable("members")
    .addUniqueConstraint("members_id_team_id_uq", ["id", "team_id"])
    .execute();

  await db.schema
    .createTable("member_personal_ids")
    .addColumn("member_id", "uuid", (col) => col.primaryKey())
    .addColumn("team_id", "uuid", (col) => col.notNull())
    // Twelve digits, no separator — normalised by parsePersonalId().
    .addColumn("personal_id", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addUniqueConstraint("member_personal_ids_team_number_uq", [
      "team_id",
      "personal_id",
    ])
    .addForeignKeyConstraint(
      "member_personal_ids_member_fk",
      ["member_id", "team_id"],
      "members",
      ["id", "team_id"],
      (cb) => cb.onDelete("cascade")
    )
    .execute();

  await db.schema
    .createTable("member_contacts")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("member_id", "uuid", (col) =>
      col.notNull().references("members.id").onDelete("cascade")
    )
    .addColumn("name", "text", (col) => col.notNull())
    /** Free text as written in the export ("Mamma", "Pappa") — not an enum. */
    .addColumn("relation", "text")
    .addColumn("email", "text")
    .addColumn("phone", "text")
    /** Set once this contact has an account; null while they are only data. */
    .addColumn("user_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null")
    )
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("member_contacts_member_id_idx")
    .on("member_contacts")
    .column("member_id")
    .execute();

  await db.schema
    .createIndex("member_contacts_user_id_idx")
    .on("member_contacts")
    .column("user_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("member_contacts").execute();
  await db.schema.dropTable("member_personal_ids").execute();
  await db.schema
    .alterTable("members")
    .dropConstraint("members_id_team_id_uq")
    .execute();
  await db.schema
    .alterTable("members")
    .dropConstraint("members_team_external_ref_uq")
    .execute();
  await db.schema.alterTable("members").dropColumn("external_ref").execute();
  await db.schema.alterTable("members").dropColumn("birth_date").execute();
}
