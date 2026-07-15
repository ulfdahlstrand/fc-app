import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./types.js";

// ---------------------------------------------------------------------------
// Kysely database client
//
// A single Kysely instance is exported for use by all procedure handlers.
// The Pool (and therefore the real PostgreSQL connection) is initialised
// lazily — DATABASE_URL is only read the first time a query is executed.
// This keeps unit tests that inject their own mock `db` free of connection
// errors.
//
// Procedure handlers that accept `db` as a parameter (dependency injection)
// import `db` from this module as the production default.
// ---------------------------------------------------------------------------

function createDb(): Kysely<Database> {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error(
      "[backend] DATABASE_URL environment variable is not set. " +
        "Cannot connect to PostgreSQL."
    );
  }
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString }),
    }),
  });
}

let _db: Kysely<Database> | undefined;

/**
 * Returns the shared Kysely instance, creating it on first access.
 * Throws if DATABASE_URL is not set.
 */
export function getDb(): Kysely<Database> {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}
