import { type Kysely } from "kysely";

/**
 * Who answered a call-up (issue #17 follow-up).
 *
 * A coach may answer on a member's behalf — "he phoned to say he can't make
 * it" is how half of these arrive — but the squad has to be able to see that
 * the answer came from the coach rather than from the player, and from which
 * coach. An answer nobody can trace is worse than no answer.
 *
 * `responded_on_behalf` is stored rather than derived: whether the responder
 * was linked to the member is known at the moment of writing, and a coach who
 * is also that member's guardian is answering *for their own child*, which is
 * not on anyone's behalf. Recomputing that later would need the links as they
 * were then, not as they are now.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("callup_invitations")
    // SET NULL, not cascade: losing the account must not lose the answer.
    .addColumn("responded_by_user_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null")
    )
    .execute();

  await db.schema
    .alterTable("callup_invitations")
    .addColumn("responded_on_behalf", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("callup_invitations")
    .dropColumn("responded_on_behalf")
    .execute();
  await db.schema
    .alterTable("callup_invitations")
    .dropColumn("responded_by_user_id")
    .execute();
}
