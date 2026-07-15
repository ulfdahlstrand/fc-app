import { oc } from "@orpc/contract";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Health procedure — Zod schemas
//
// The first (and so far only) procedure. It validates the full end-to-end
// stack: contract → backend handler → typed frontend client. Domain
// procedures (members, activities, attendance, …) are added here as the
// product plan (docs/product/product-spec.md) is implemented.
// ---------------------------------------------------------------------------

export const healthInputSchema = z.object({
  echo: z.string().optional(),
});

export const healthOutputSchema = z.object({
  status: z.literal("ok"),
  echo: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Router contract
//
// Defines the shape of every procedure (input + output schemas) without any
// implementation. The backend imports this contract and attaches handlers;
// the frontend imports the inferred AppRouter type for a fully-typed client.
// ---------------------------------------------------------------------------

export const contract = oc.router({
  // Explicit GET route so plain `curl /health` (e.g. the Docker Compose
  // healthcheck) works; the `echo` input is passed as a query parameter.
  health: oc
    .route({ method: "GET", path: "/health" })
    .input(healthInputSchema)
    .output(healthOutputSchema),
});

/** Inferred contract type — used by the frontend to create a typed oRPC client. */
export type AppRouter = typeof contract;
