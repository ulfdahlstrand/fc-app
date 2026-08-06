/** Migration — see ADR-006 for why schema changes only happen here. */
import { sql, type Kysely } from "kysely";

/**
 * A person's identifiers get their own tables (#89, amending ADR-023).
 *
 * ADR-023 made the personnummer the node. That was right about the person
 * being the record and wrong about what identifies them: the number became
 * the only way to exist in the register, so anyone without one — 13 of 49
 * members in practice, including a whole team — could not be in it at all.
 * Those are exactly the people name matching keeps failing on, which is how
 * a file of names produced 36 duplicate members.
 *
 * So `persons` becomes a bare anchor and both kinds of identifier hang off
 * it: the personnummer, unique and one per person, and any number of external
 * ids from systems the club has imported from.
 *
 * ADR-022's read gate survives the split intact. The number still lives in
 * one table that one module touches — and now a `selectAll()` on `persons`
 * cannot carry it either.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Both children reference (id, club_id) rather than id alone, so a child
  // row cannot drift into another tenant (ADR-003). `members` already uses
  // the same trick for its team.
  await db.schema
    .alterTable("persons")
    .addUniqueConstraint("persons_id_club_id_uq", ["id", "club_id"])
    .execute();

  await db.schema
    .createTable("person_personal_ids")
    // The person is the key: one personnummer per person, by construction.
    .addColumn("person_id", "uuid", (col) => col.primaryKey())
    .addColumn("club_id", "uuid", (col) => col.notNull())
    /** Twelve digits, no separator — normalised by parsePersonalId(). */
    .addColumn("personal_id", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addUniqueConstraint("person_personal_ids_club_number_uq", [
      "club_id",
      "personal_id",
    ])
    .addForeignKeyConstraint(
      "person_personal_ids_person_club_fk",
      ["person_id", "club_id"],
      "persons",
      ["id", "club_id"],
      (fk) => fk.onDelete("cascade")
    )
    .execute();

  await sql`
    INSERT INTO person_personal_ids (person_id, club_id, personal_id, created_at)
    SELECT id, club_id, personal_id, created_at FROM persons
  `.execute(db);

  await db.schema.alterTable("persons").dropColumn("personal_id").execute();

  await db.schema
    .createTable("person_external_ids")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("person_id", "uuid", (col) => col.notNull())
    .addColumn("club_id", "uuid", (col) => col.notNull())
    /**
     * Which system issued it. Free text with a convention, because two
     * SportAdmin identifiers are not one namespace: `sportadmin` is its
     * internal member id, `sportadmin-medlemsnr` the club's own number.
     */
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("external_id", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    // A person has one connection per system — one SportAdmin link, not
    // several — so re-importing a changed id overwrites rather than
    // accumulating. Several rows per person is still the point; several *per
    // source* is a duplicate.
    //
    // The id itself is deliberately not unique. Two people holding one id
    // would be a mistake, but it is the source's mistake to make, and a
    // constraint here would fail a whole import over it.
    // `loadMemberExternalIds` treats such an id as ambiguous instead and
    // falls back to matching by name, which is what it did before there were
    // ids at all.
    .addUniqueConstraint("person_external_ids_person_source_uq", [
      "person_id",
      "source",
    ])
    .addForeignKeyConstraint(
      "person_external_ids_person_club_fk",
      ["person_id", "club_id"],
      "persons",
      ["id", "club_id"],
      (fk) => fk.onDelete("cascade")
    )
    .execute();

  await db.schema
    .createIndex("person_external_ids_person_id_idx")
    .on("person_external_ids")
    .column("person_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("person_external_ids").execute();

  await db.schema
    .alterTable("persons")
    .addColumn("personal_id", "text")
    .execute();
  await sql`
    UPDATE persons SET personal_id = p.personal_id
    FROM person_personal_ids p WHERE p.person_id = persons.id
  `.execute(db);
  // A person created without a personnummer cannot exist in the old shape.
  await sql`DELETE FROM persons WHERE personal_id IS NULL`.execute(db);
  await sql`ALTER TABLE persons ALTER COLUMN personal_id SET NOT NULL`.execute(
    db
  );
  await db.schema
    .alterTable("persons")
    .addUniqueConstraint("persons_club_personal_id_uq", [
      "club_id",
      "personal_id",
    ])
    .execute();

  await db.schema.dropTable("person_personal_ids").execute();
  await db.schema
    .alterTable("persons")
    .dropConstraint("persons_id_club_id_uq")
    .execute();
}
