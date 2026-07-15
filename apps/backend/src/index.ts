import { createServer } from "node:http";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { onError } from "@orpc/server";
import { CORSPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { contract } from "@fc-app/contracts";
import { router } from "./router.js";

const port = Number(process.env["BACKEND_PORT"] ?? 3001);

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

const spec = await generator.generate(contract, {
  info: { title: "fc-app API", version: "0.0.0" },
});
const specJson = JSON.stringify(spec);

const handler = new OpenAPIHandler(router, {
  plugins: [new CORSPlugin()],
  interceptors: [
    onError((error) => {
      console.error("[backend] unhandled error:", error);
    }),
  ],
});

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/openapi.json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(specJson);
    return;
  }

  const result = await handler.handle(req, res, { context: {} });

  if (!result.matched) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not Found" }));
  }
});

server.listen(port, () => {
  console.log(`[backend] Server listening on port ${port}`);
  console.log(`[backend] OpenAPI spec at http://localhost:${port}/openapi.json`);
});
