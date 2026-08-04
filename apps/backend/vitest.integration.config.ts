import { defineConfig } from "vitest/config";

/**
 * Integration tests: real Postgres, real constraints. Run serially — they
 * share one database and truncate it between tests.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["src/test/setup-integration.ts"],
    fileParallelism: false,
    // Migrating a fresh database on the first test costs more than a unit test.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
