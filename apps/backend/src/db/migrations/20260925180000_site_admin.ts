/** Migration — see ADR-006 for why schema changes only happen here. */
import type { Kysely } from "kysely";

/**
 * Site admins (ADR-025): whoever runs the installation, above every club.
 *
 * A site admin may create an account with an address and password of their
 * choosing — the one place the app trusts an address nobody proved (ADR-024).
 * That is only sound in the hands of someone who could write the row with
 * `psql` anyway, which is why the flag is set with SQL and never through the
 * app: no procedure grants it, not even to another site admin.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("users")
    .addColumn("is_site_admin", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("users").dropColumn("is_site_admin").execute();
}
