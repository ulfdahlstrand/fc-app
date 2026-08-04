/**
 * The migrator itself, separate from the script that runs it (ADR-006).
 *
 * `migrate.ts` executes on import, which means nothing else could ever reuse
 * it — including the integration tests, whose whole job is to bring a real
 * database up to date and then exercise it.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  Migrator,
  type Kysely,
  type Migration,
  type MigrationProvider,
  type MigrationResultSet,
} from "kysely";
import type { Database } from "./types.js";

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

export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({
    db,
    provider: new MigrationFileProvider(path.join(__dirname, "migrations")),
  });
}

export async function migrateToLatest(
  db: Kysely<Database>
): Promise<MigrationResultSet> {
  return await createMigrator(db).migrateToLatest();
}
