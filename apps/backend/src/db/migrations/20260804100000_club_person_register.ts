/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * The personnummer becomes the node, not an attribute (ADR-023, amending
 * ADR-022).
 *
 * `member_personal_ids` hung the number off a member and made it unique per
 * *team*, so one human in two age groups was two unrelated numbers. Inverting
 * it gives the club a person register: the person is the record, and a member
 * is that person in a particular team.
 *
 * Only the identity moves. Names, addresses and contact details stay on
 * `members` and `member_contacts` — ADR-022 keeps the number apart from
 * everything else, and a register that grew names would quietly undo that.
 *
 * Scoped to the club rather than globally: ADR-003 isolates tenants row by
 * row, and a person shared between two clubs would be the first row that is
 * not. One club's register answers the case that exists — the same child in
 * P14 and P17.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("persons")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("club_id", "uuid", (col) =>
      col.notNull().references("clubs.id").onDelete("cascade")
    )
    /** Twelve digits, no separator — normalised by parsePersonalId(). */
    .addColumn("personal_id", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addUniqueConstraint("persons_club_personal_id_uq", [
      "club_id",
      "personal_id",
    ])
    .execute();

  await db.schema
    .alterTable("members")
    .addColumn("person_id", "uuid", (col) =>
      col.references("persons.id").onDelete("set null")
    )
    .execute();

  await db.schema
    .createIndex("members_person_id_idx")
    .on("members")
    .column("person_id")
    .execute();

  // Backfill. Two members of one club holding the same number — the same child
  // in two age groups — collapse into one person, which is the point.
  await sql`
    INSERT INTO persons (club_id, personal_id)
    SELECT DISTINCT t.club_id, p.personal_id
    FROM member_personal_ids p
    JOIN teams t ON t.id = p.team_id
  `.execute(db);

  await sql`
    UPDATE members m
    SET person_id = pe.id
    FROM member_personal_ids p
    JOIN teams t ON t.id = p.team_id
    JOIN persons pe
      ON pe.club_id = t.club_id AND pe.personal_id = p.personal_id
    WHERE p.member_id = m.id
  `.execute(db);

  await db.schema.dropTable("member_personal_ids").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("member_personal_ids")
    .addColumn("member_id", "uuid", (col) => col.primaryKey())
    .addColumn("team_id", "uuid", (col) => col.notNull())
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

  await sql`
    INSERT INTO member_personal_ids (member_id, team_id, personal_id)
    SELECT m.id, m.team_id, p.personal_id
    FROM members m
    JOIN persons p ON p.id = m.person_id
  `.execute(db);

  await db.schema.alterTable("members").dropColumn("person_id").execute();
  await db.schema.dropTable("persons").execute();
}
