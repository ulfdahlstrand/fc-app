/** Migration — see ADR-006 for why schema changes only happen here. */
import { type Kysely } from "kysely";

/**
 * A contact who is also on the roster (#65).
 *
 * A coach appears twice in a SportAdmin export: once as their own row, and
 * again as `Målsman 2` on their child's. Without this column those are two
 * unrelated records of one person, and nothing in the app can say so.
 *
 * It is deliberately not a person register. `member_contacts` stays the
 * waiting room for people who have no account yet; `users` is where a person
 * becomes one identity across the club, and `user_id` is that link. This
 * column only closes the case where the person is already on the roster.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("member_contacts")
    .addColumn("linked_member_id", "uuid", (col) =>
      col.references("members.id").onDelete("set null")
    )
    .execute();

  await db.schema
    .createIndex("member_contacts_linked_member_id_idx")
    .on("member_contacts")
    .column("linked_member_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("member_contacts")
    .dropColumn("linked_member_id")
    .execute();
}
