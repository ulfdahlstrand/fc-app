/** Migration — see ADR-006 for why schema changes only happen here. */
import { type Kysely } from "kysely";

/** Who answered a call-up (issue #17 follow-up). */
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
