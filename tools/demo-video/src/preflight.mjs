/**
 * Refuses to record rather than recording something wrong.
 *
 * Every check here runs over HTTP, so the tool needs no database credentials
 * and — deliberately — has no way to reset anything. A demo recorder that can
 * drop a schema is the kind of thing you start by accident exactly once.
 */
import { config } from "./config.mjs";

class PreflightError extends Error {}

const fail = (message) => {
  throw new PreflightError(message);
};

async function reachable(url) {
  try {
    const response = await fetch(url, { redirect: "manual" });
    return response.status > 0;
  } catch {
    return false;
  }
}

/** Signs in through the dev bypass and returns the session cookie. */
async function devLogin() {
  const response = await fetch(`${config.apiUrl}/auth/dev-login`, {
    redirect: "manual",
  }).catch(() => null);

  if (!response) fail(`The API at ${config.apiUrl} did not answer.`);
  if (response.status === 404) {
    fail(
      "The dev sign-in endpoint is not enabled, so the recorder cannot sign in.\n\n" +
        "Set both of these in .env and restart the backend:\n" +
        "  ENABLE_DEV_LOGIN=true\n" +
        "  VITE_ENABLE_DEV_LOGIN=true",
    );
  }

  const cookie = response.headers.get("set-cookie");
  if (!cookie) fail("Dev sign-in returned no session cookie.");
  return cookie.split(";")[0];
}

export async function preflight({ requiresEmptyDatabase = true } = {}) {
  if (!(await reachable(`${config.apiUrl}/health`))) {
    fail(
      `The backend is not answering at ${config.apiUrl}.\n\n` +
        "Start it and try again:\n" +
        "  npm run docker:up      # database\n" +
        "  npm run dev            # backend + frontend",
    );
  }

  if (!(await reachable(config.appUrl))) {
    fail(
      `The frontend is not answering at ${config.appUrl}.\n\n` +
        "Start it with `npm run dev` and try again.",
    );
  }

  const cookie = await devLogin();
  if (!requiresEmptyDatabase) return { cookie };

  const response = await fetch(`${config.apiUrl}/my-clubs`, {
    headers: { cookie },
  });
  if (!response.ok) {
    fail(`Could not read /my-clubs (HTTP ${response.status}).`);
  }

  const { clubs = [] } = await response.json();
  if (clubs.length > 0) {
    const names = clubs.map((club) => `"${club.name ?? club.id}"`).join(", ");
    fail(
      `This flow records from an empty database, and there is already data ` +
        `here (found ${names}).\n\n` +
        "Reset it yourself, then run again:\n" +
        "  psql \"$DATABASE_URL\" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'\n" +
        "  npm run migrate -w apps/backend\n\n" +
        "This tool never touches the database on your behalf.",
    );
  }

  return { cookie };
}

export { PreflightError };
