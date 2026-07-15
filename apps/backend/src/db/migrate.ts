import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Migration, MigrationProvider } from "kysely";
import { Migrator } from "kysely";
import { getDb } from "./client.js";

// ---------------------------------------------------------------------------
// Migration runner CLI
//
// Runs all pending Kysely migrations to bring the database schema up to date.
// Usage: npm run migrate -w apps/backend
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Only load files that look like migrations (timestamp prefix, not test files). */
class MigrationFileProvider implements MigrationProvider {
  constructor(private readonly folder: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const files = await fs.readdir(this.folder);
    const migrations: Record<string, Migration> = {};
    for (const file of files) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.js")) continue;
      if (!file.match(/^\d{14}_/)) continue;
      const filePath = path.join(this.folder, file);
      const mod = await import(pathToFileURL(filePath).href);
      const name = path.basename(file, path.extname(file));
      migrations[name] = mod as Migration;
    }
    return migrations;
  }
}

const db = getDb();

const migrator = new Migrator({
  db,
  provider: new MigrationFileProvider(path.join(__dirname, "migrations")),
});

const { error, results } = await migrator.migrateToLatest();

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
