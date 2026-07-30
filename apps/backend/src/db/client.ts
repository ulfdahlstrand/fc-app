/** The Kysely pool, created lazily so tests need no DATABASE_URL. */
import { Kysely, PostgresDialect } from "kysely";
import { Pool, types } from "pg";
import type { Database } from "./types.js";

/** A DATE column has no time and no timezone. */
types.setTypeParser(types.builtins.DATE, (value) => value);

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

/** Returns the shared Kysely instance, creating it on first access. */
export function getDb(): Kysely<Database> {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}
