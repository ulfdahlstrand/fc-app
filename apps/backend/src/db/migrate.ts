/** Migration runner — the only mechanism that touches schema (ADR-006). */
import { getDb } from "./client.js";
import { migrateToLatest } from "./migrator.js";

const db = getDb();

const { error, results } = await migrateToLatest(db);

if (results) {
  for (const result of results) {
    if (result.status === "Success") {
      console.log(`[migrate] Applied: ${result.migrationName}`);
    } else if (result.status === "Error") {
      console.error(`[migrate] Failed: ${result.migrationName}`);
    }
  }
}

if (error) {
  console.error("[migrate] Migration failed:", error);
  process.exit(1);
}

if (!results || results.length === 0) {
  console.log("[migrate] No pending migrations.");
}

await db.destroy();
