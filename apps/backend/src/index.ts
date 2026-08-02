/** HTTP entry point: oRPC over the OpenAPI handler, plus the auth routes. */
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { ORPCError, onError } from "@orpc/server";
import { CORSPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { contract } from "@fc-app/contracts";
import { handleAuthRequest } from "./auth/http.js";
import { resolveContext } from "./context.js";
import { router } from "./router.js";

// The host platform dictates the port to bind and injects it as PORT (ADR-020);
// BACKEND_PORT is the name used locally and in Docker Compose.
const port = Number(process.env["PORT"] ?? process.env["BACKEND_PORT"] ?? 4001);
const frontendOrigin = new URL(
  process.env["FRONTEND_URL"] ?? "http://localhost:4173"
).origin;

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

const spec = await generator.generate(contract, {
  info: { title: "fc-app API", version: "0.0.0" },
});
const specJson = JSON.stringify(spec);

type PlainHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => Promise<void>;

/** Loads the dev-only sign-in handler, or null when it must not exist. */
async function loadDevLogin(): Promise<PlainHandler | null> {
  if (process.env["NODE_ENV"] === "production") return null;
  if (process.env["ENABLE_DEV_LOGIN"] !== "true") return null;

  const specifier: string = "./auth/dev-login.dev.js";
  const mod = (await import(specifier)) as { handleDevLogin: PlainHandler };
  console.warn(
    "[backend] DEV login endpoint enabled at GET /auth/dev-login — never enable in production"
  );
  return mod.handleDevLogin;
}

const devLogin = await loadDevLogin();

const handler = new OpenAPIHandler(router, {
  plugins: [
    // credentials: the SPA sends the session cookie cross-origin (5173 → 3001),
    // which requires a concrete allowed origin instead of "*".
    new CORSPlugin({ origin: frontendOrigin, credentials: true }),
  ],
  interceptors: [
    onError((error) => {
      // Expected client errors (401/403/422 …) are part of normal operation.
      if (error instanceof ORPCError && error.status < 500) return;
      console.error("[backend] unhandled error:", error);
    }),
  ],
});

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/openapi.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(specJson);
      return;
    }

    if (
      devLogin &&
      req.method === "GET" &&
      new URL(req.url ?? "/", "http://internal").pathname === "/auth/dev-login"
    ) {
      await devLogin(req, res);
      return;
    }

    if (await handleAuthRequest(req, res)) {
      return;
    }

    const context = await resolveContext(req);
    const result = await handler.handle(req, res, { context });

    if (!result.matched) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "Not Found" }));
    }
  } catch (error) {
    // A throwing endpoint (e.g. missing auth env vars) must not crash the
    // process via an unhandled rejection.
    console.error("[backend] request failed:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    } else {
      res.end();
    }
  }
});

server.listen(port, () => {
  console.log(`[backend] Server listening on port ${port}`);
  console.log(`[backend] OpenAPI spec at http://localhost:${port}/openapi.json`);
});
