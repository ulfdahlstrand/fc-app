/**
 * oRPC client singleton.
 *
 * Typed against the AppRouter type exported from @fc-app/contracts so that
 * every procedure call is fully type-safe — input validation, output inference,
 * and IDE autocomplete all work without a separate codegen step.
 *
 * Transport: OpenAPILink — communicates with the backend via its OpenAPI-compatible
 * HTTP endpoint (exposed via OpenAPIHandler). The OpenAPILink derives HTTP method
 * and path from the contract definition, rather than using the plain RPC protocol.
 *
 * The backend API base URL is read exclusively from the VITE_API_URL environment
 * variable. No URL is hardcoded. If VITE_API_URL is unset, the client is created
 * with an empty base URL — API calls will fail with a network error, but the
 * application will not crash on startup.
 */
import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { contract, type AppRouter } from "@fc-app/contracts";

const apiUrl: string = import.meta.env["VITE_API_URL"] ?? "";

const link = new OpenAPILink(contract, {
  url: apiUrl,
});

export const orpc = createORPCClient<ContractRouterClient<AppRouter>>(link);
