/**
 * A real Postgres for tests that need one.
 *
 * The handler tests elsewhere mock Kysely, which is fast and catches shape
 * mistakes — but a mock has no constraints, no ON CONFLICT inference and no
 * case-sensitive text comparison. Every bug the member-import work actually
 * shipped got past those tests and the type checker both, and was found by
 * hand. This is the harness that stops relying on that.
 *
 * Point `TEST_DATABASE_URL` at a database you do not mind losing: every table
 * is truncated between tests.
 */
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool, types } from "pg";
import { migrateToLatest } from "../db/migrator.js";
import type { Database } from "../db/types.js";

/** A DATE column has no time and no timezone — as in db/client.ts. */
types.setTypeParser(types.builtins.DATE, (value) => value);

/**
 * `TEST_DATABASE_URL` wins. Otherwise the development `DATABASE_URL` with
 * `_test` appended to the database name — same host and credentials, different
 * database, so nobody has to configure a second set and nobody can truncate
 * their development data by forgetting to.
 */
function connectionString(): string {
  const explicit = process.env["TEST_DATABASE_URL"];
  if (explicit) return explicit;

  const development = process.env["DATABASE_URL"];
  if (!development) {
    throw new Error(
      "[backend] Integration tests need TEST_DATABASE_URL, or DATABASE_URL " +
        "to derive it from. Run them with `npm run test:integration`."
    );
  }

  const url = new URL(development);
  const name = url.pathname.replace(/^\//, "");
  if (name.endsWith("_test")) return development;
  url.pathname = `/${name}_test`;
  return url.toString();
}

let pool: Pool | undefined;
let db: Kysely<Database> | undefined;
let migrated = false;

/**
 * The test database, migrated on first use. `getDb()` in the application code
 * reads DATABASE_URL, so tests that call handlers set it to the same string —
 * see `useTestDatabase`.
 */
export async function testDb(): Promise<Kysely<Database>> {
  if (!db) {
    pool = new Pool({ connectionString: connectionString() });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  }
  if (!migrated) {
    const { error } = await migrateToLatest(db);
    if (error) throw error;
    migrated = true;
  }
  return db;
}

/**
 * Empties every table the application owns. `kysely_migration` and its lock
 * are left alone — re-running migrations per test would be slow and pointless.
 */
export async function truncateAll(): Promise<void> {
  const database = await testDb();
  const { rows } = await sql<{ tablename: string }>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE 'kysely_%'
  `.execute(database);

  if (rows.length === 0) return;
  const names = rows.map((row) => `"${row.tablename}"`).join(", ");
  await sql.raw(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`).execute(
    database
  );
}

export async function closeTestDb(): Promise<void> {
  await db?.destroy();
  db = undefined;
  pool = undefined;
  migrated = false;
}

/**
 * Makes the application's own `getDb()` resolve to the test database.
 *
 * Call before importing anything that reaches for a connection. The module
 * caches its pool on first access, which is exactly why this has to be set up
 * front rather than per test.
 */
export function useTestDatabase(): void {
  process.env["DATABASE_URL"] = connectionString();
}
