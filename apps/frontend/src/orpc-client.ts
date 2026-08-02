/** oRPC client singleton. */
import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { contract, type AppRouter } from "@fc-app/contracts";
import { getApiUrl } from "./lib/api-url";

const link = new OpenAPILink(contract, {
  // Passed as a function so it resolves per request rather than at import:
  // this module is imported in `environment: "node"` tests, where there is no
  // `location` to resolve a relative VITE_API_URL against.
  url: getApiUrl,
  fetch: (request, init) =>
    globalThis.fetch(request, { ...init, credentials: "include" }),
});

export const orpc = createORPCClient<ContractRouterClient<AppRouter>>(link);
