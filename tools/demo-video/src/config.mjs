/** Everything environment-dependent, in one place. */
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const toolRoot = path.resolve(here, "..");
export const repoRoot = path.resolve(toolRoot, "../..");

export const config = {
  /** The SPA. Matches VITE_PORT in .env.example. */
  appUrl: process.env["DEMO_APP_URL"] ?? "http://localhost:4173",
  /** The API — used for dev-login and the preflight checks. */
  apiUrl: process.env["DEMO_API_URL"] ?? "http://localhost:4001",
  /** Passed as `?lng=`, so a flow can be recorded in either locale. */
  lang: process.env["DEMO_LANG"] ?? "sv",
  outDir: path.resolve(toolRoot, process.env["DEMO_OUT"] ?? "out"),
  /**
   * An explicit Chromium binary. Leave unset on a normal machine and Playwright
   * uses the one `npx playwright install chromium` put in its own cache. Set it
   * where a browser is provisioned outside that cache and the build number does
   * not match what this Playwright version looks for on its own.
   */
  chromium: process.env["DEMO_CHROMIUM"] ?? undefined,
};

export const flowsDir = path.join(toolRoot, "flows");
