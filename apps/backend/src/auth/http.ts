import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getDb } from "../db/client.js";
import { clearCookie, parseCookies, serializeCookie } from "./cookies.js";
import { exchangeGoogleCode, getGoogleAuthUrl } from "./google.js";
import {
  SESSION_COOKIE,
  createSession,
  deleteSessionByToken,
} from "./session.js";
import { signInWithProfile } from "./sign-in.js";

// ---------------------------------------------------------------------------
// Plain HTTP auth endpoints (outside oRPC — they redirect and set cookies):
//
//   GET  /auth/google           → redirect to Google's consent screen
//   GET  /auth/google/callback  → exchange code, create session, redirect to app
//   POST /auth/logout           → delete session, clear cookie
// ---------------------------------------------------------------------------

const STATE_COOKIE = "fc_oauth_state";

function frontendUrl(): string {
  return process.env["FRONTEND_URL"] ?? "http://localhost:5173";
}

/** CORS headers for the logout endpoint (called via fetch from the SPA). */
function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": new URL(frontendUrl()).origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

/**
 * Handles auth routes. Returns true if the request was handled, false if it
 * should fall through to the oRPC handler.
 */
export async function handleAuthRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://internal");

  if (req.method === "GET" && url.pathname === "/auth/google") {
    const state = randomBytes(16).toString("hex");
    res.writeHead(302, {
      "Set-Cookie": serializeCookie(STATE_COOKIE, state, {
        maxAgeSeconds: 600,
      }),
      Location: getGoogleAuthUrl(state),
    });
    res.end();
    return true;
  }

  if (req.method === "GET" && url.pathname === "/auth/google/callback") {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (!code || !state || state !== cookies[STATE_COOKIE]) {
        throw new Error("[auth] Invalid or missing OAuth state/code");
      }

      const profile = await exchangeGoogleCode(code);
      const userId = await signInWithProfile(getDb(), profile);
      const { token, expiresAt } = await createSession(getDb(), userId);

      res.writeHead(302, {
        "Set-Cookie": [
          clearCookie(STATE_COOKIE),
          serializeCookie(SESSION_COOKIE, token, { expires: expiresAt }),
        ],
        Location: frontendUrl(),
      });
      res.end();
    } catch (error) {
      console.error("[auth] Sign-in failed:", error);
      res.writeHead(302, {
        "Set-Cookie": clearCookie(STATE_COOKIE),
        Location: `${frontendUrl()}/login?error=auth_failed`,
      });
      res.end();
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/auth/logout") {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      await deleteSessionByToken(getDb(), token);
    }
    res.writeHead(204, {
      "Set-Cookie": clearCookie(SESSION_COOKIE),
      ...corsHeaders(),
    });
    res.end();
    return true;
  }

  return false;
}
