import { createServer } from "node:http";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { ORPCError, onError } from "@orpc/server";
import { CORSPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { contract } from "@fc-app/contracts";
import { handleAuthRequest } from "./auth/http.js";
import { resolveContext } from "./context.js";
import { router } from "./router.js";

const port = Number(process.env["BACKEND_PORT"] ?? 3001);
const frontendOrigin = new URL(
  process.env["FRONTEND_URL"] ?? "http://localhost:5173"
).origin;

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

const spec = await generator.generate(contract, {
  info: { title: "fc-app API", version: "0.0.0" },
});
const specJson = JSON.stringify(spec);

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
