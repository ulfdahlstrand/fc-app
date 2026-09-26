/**
 * The /auth/password routes (ADR-024). Plain HTTP beside the Google routes,
 * because they set the session cookie; the rules live in `password-flows.ts`
 * and the input shapes in the contract.
 *
 * Every route is a JSON POST from the SPA. Requiring `application/json` makes a
 * cross-site form post impossible and a cross-site fetch preflighted, and the
 * Origin check refuses the rest — so nobody can sign a visitor into an account
 * of their choosing (login CSRF).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  emailVerifyInputSchema,
  passwordForgotInputSchema,
  passwordLoginInputSchema,
  passwordRegisterInputSchema,
  passwordResetInputSchema,
} from "@fc-app/contracts";
import type { z } from "zod";
import { getDb } from "../db/client.js";
import { serializeCookie } from "./cookies.js";
import { canSendMail, sendMail, type Mail } from "./mailer.js";
import {
  login,
  register,
  requestReset,
  resetPassword,
  verifySignup,
} from "./password-flows.js";
import { RateLimiter, type RateLimitDecision } from "./rate-limit.js";
import { SESSION_COOKIE, createSession } from "./session.js";

const PREFIX = "/auth/password/";
const MAX_BODY_BYTES = 8 * 1024;
const MINUTE = 60 * 1000;

const limits = {
  loginPerEmail: new RateLimiter({ limit: 10, windowMs: 15 * MINUTE }),
  loginPerIp: new RateLimiter({ limit: 50, windowMs: 15 * MINUTE }),
  // Every accepted request sends a mail; these keep an inbox from being flooded.
  mailPerEmail: new RateLimiter({ limit: 3, windowMs: 60 * MINUTE }),
  mailPerIp: new RateLimiter({ limit: 20, windowMs: 60 * MINUTE }),
  tokenPerIp: new RateLimiter({ limit: 30, windowMs: 15 * MINUTE }),
};

function frontendUrl(): string {
  return (process.env["FRONTEND_URL"] ?? "http://localhost:4173").replace(
    /\/$/,
    ""
  );
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": new URL(frontendUrl()).origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

/**
 * The address the request came from. Behind Render's proxy that is the first
 * X-Forwarded-For entry, which a client can forge — so per-IP limits are only
 * the coarse brake, and the per-email ones carry the weight.
 */
function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(",")[0]
    ?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

/**
 * Browsers always send Origin on a POST. A different one is another site
 * trying to act on the visitor's behalf; none at all is a non-browser client,
 * which has no cookies of the visitor's to abuse.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  allowed: string
): boolean {
  return origin === undefined || origin === new URL(allowed).origin;
}

function send(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string | string[]> = {}
): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...corsHeaders(),
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function refuseIfLimited(
  res: ServerResponse,
  ...decisions: RateLimitDecision[]
): boolean {
  const refused = decisions.find((d) => !d.allowed);
  if (!refused || refused.allowed) return false;
  send(
    res,
    429,
    { error: "rate_limited", retryAfterSeconds: refused.retryAfterSeconds },
    { "Retry-After": String(refused.retryAfterSeconds) }
  );
  return true;
}

class BadRequest extends Error {}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BadRequest("body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BadRequest("invalid JSON");
  }
}

async function parse<T extends z.ZodType>(
  req: IncomingMessage,
  schema: T
): Promise<z.output<T>> {
  const result = schema.safeParse(await readJson(req));
  if (!result.success) throw new BadRequest("invalid input");
  return result.data;
}

/** Mail goes out after the response, so its timing says nothing. */
function sendInBackground(mail: Mail | null): void {
  if (!mail) return;
  sendMail(mail).catch((error: unknown) => {
    console.error(
      "[auth] Could not send email:",
      error instanceof Error ? error.message : error
    );
  });
}

async function signIn(res: ServerResponse, userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(getDb(), userId);
  send(res, 200, { ok: true }, {
    "Set-Cookie": serializeCookie(SESSION_COOKIE, token, { expires: expiresAt }),
  });
}

type Route = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

const routes: Record<string, Route> = {
  async register(req, res) {
    const input = await parse(req, passwordRegisterInputSchema);
    if (
      refuseIfLimited(
        res,
        limits.mailPerIp.hit(clientIp(req)),
        limits.mailPerEmail.hit(input.email)
      )
    )
      return;
    sendInBackground(await register(getDb(), input, frontendUrl()));
    send(res, 202, { ok: true });
  },

  async verify(req, res) {
    if (refuseIfLimited(res, limits.tokenPerIp.hit(clientIp(req)))) return;
    const { token } = await parse(req, emailVerifyInputSchema);
    const userId = await verifySignup(getDb(), token);
    if (!userId) return send(res, 400, { error: "invalid_token" });
    await signIn(res, userId);
  },

  async login(req, res) {
    const { email, password } = await parse(req, passwordLoginInputSchema);
    if (
      refuseIfLimited(
        res,
        limits.loginPerIp.hit(clientIp(req)),
        limits.loginPerEmail.hit(email)
      )
    )
      return;
    const userId = await login(getDb(), email, password);
    if (!userId) return send(res, 401, { error: "invalid_credentials" });
    limits.loginPerEmail.reset(email);
    await signIn(res, userId);
  },

  async forgot(req, res) {
    const { email } = await parse(req, passwordForgotInputSchema);
    if (
      refuseIfLimited(
        res,
        limits.mailPerIp.hit(clientIp(req)),
        limits.mailPerEmail.hit(email)
      )
    )
      return;
    sendInBackground(await requestReset(getDb(), email, frontendUrl()));
    send(res, 202, { ok: true });
  },

  async reset(req, res) {
    if (refuseIfLimited(res, limits.tokenPerIp.hit(clientIp(req)))) return;
    const { token, password } = await parse(req, passwordResetInputSchema);
    const userId = await resetPassword(getDb(), token, password);
    if (!userId) return send(res, 400, { error: "invalid_token" });
    await signIn(res, userId);
  },
};

/** Handles /auth/password/* — returns false for any other path. */
export async function handlePasswordRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith(PREFIX)) return false;
  const name = pathname.slice(PREFIX.length);
  // hasOwn, so "/auth/password/toString" is not a route.
  const route = Object.hasOwn(routes, name) ? routes[name] : undefined;
  if (!route) return false;

  // Preflight: in development the SPA and API are on different ports.
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...corsHeaders(),
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    });
    res.end();
    return true;
  }

  // Everything but login rests on a mail arriving, so it is switched off until
  // mail works (see `canSendMail`): refuse rather than accept a signup whose
  // confirmation will never come. Login needs no mail and is always on — an
  // account a site admin created has a password and nothing else (ADR-025).
  if (name !== "login" && !canSendMail()) {
    send(res, 404, { error: "not_enabled" });
    return true;
  }

  if (req.method !== "POST") {
    send(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });
    return true;
  }
  if (!isAllowedOrigin(req.headers.origin, frontendUrl())) {
    send(res, 403, { error: "forbidden_origin" });
    return true;
  }
  if (!req.headers["content-type"]?.startsWith("application/json")) {
    send(res, 415, { error: "unsupported_media_type" });
    return true;
  }

  try {
    await route(req, res);
  } catch (error) {
    if (error instanceof BadRequest) {
      send(res, 400, { error: "invalid_input" });
    } else {
      throw error;
    }
  }
  return true;
}
