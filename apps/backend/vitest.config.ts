import { defineConfig } from "vitest/config";

/**
 * Unit tests: fast, no database. Integration tests live in their own project
 * (vitest.integration.config.ts) so `npm test` stays runnable with nothing
 * installed but node.
 */
export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.ts"],
  },
});
