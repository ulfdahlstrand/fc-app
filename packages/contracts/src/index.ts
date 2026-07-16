import { oc } from "@orpc/contract";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Health procedure — Zod schemas
// ---------------------------------------------------------------------------

export const healthInputSchema = z.object({
  echo: z.string().optional(),
});

export const healthOutputSchema = z.object({
  status: z.literal("ok"),
  echo: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Auth — Zod schemas
//
// `me` returns the signed-in user derived from the session cookie, or null.
// Sign-in itself is a browser redirect flow (GET /auth/google →
// /auth/google/callback) and logout is POST /auth/logout — plain HTTP
// endpoints on the backend, since they set/clear cookies and redirect.
// ---------------------------------------------------------------------------

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  imageUrl: z.string().nullable(),
});

export type User = z.infer<typeof userSchema>;

export const meInputSchema = z.object({});

export const meOutputSchema = z.object({
  user: userSchema.nullable(),
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
  me: oc
    .route({ method: "GET", path: "/me" })
    .input(meInputSchema)
    .output(meOutputSchema),
});

/** Inferred contract type — used by the frontend to create a typed oRPC client. */
export type AppRouter = typeof contract;
