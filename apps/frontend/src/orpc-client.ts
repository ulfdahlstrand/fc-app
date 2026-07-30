/** oRPC client singleton. */
import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { contract, type AppRouter } from "@fc-app/contracts";

const apiUrl: string = import.meta.env["VITE_API_URL"] ?? "";

const link = new OpenAPILink(contract, {
  url: apiUrl,
  fetch: (request, init) =>
    globalThis.fetch(request, { ...init, credentials: "include" }),
});

export const orpc = createORPCClient<ContractRouterClient<AppRouter>>(link);
