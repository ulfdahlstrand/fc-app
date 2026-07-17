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
// Clubs & teams — Zod schemas (ADR-003 multi-tenancy)
//
// A club is the tenant root; teams belong to a club. `myClubs` returns only
// clubs the caller is a member of — the frontend's club/team switcher and
// onboarding redirect are driven by it.
// ---------------------------------------------------------------------------

export const teamSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  name: z.string(),
});

export type Team = z.infer<typeof teamSchema>;

export const clubSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type Club = z.infer<typeof clubSchema>;

/** A team with the caller's effective role in it. */
export const myTeamSchema = teamSchema.extend({
  role: z.string(),
});

export type MyTeam = z.infer<typeof myTeamSchema>;

export const myClubSchema = clubSchema.extend({
  /** The caller's club-wide role, or null when only team-scoped memberships exist. */
  role: z.string().nullable(),
  /** Teams the caller's memberships grant access to, with the effective role per team. */
  teams: z.array(myTeamSchema),
});

export type MyClub = z.infer<typeof myClubSchema>;

export const myClubsInputSchema = z.object({});

export const myClubsOutputSchema = z.object({
  clubs: z.array(myClubSchema),
});

export const createClubInputSchema = z.object({
  clubName: z.string().min(1).max(100),
  teamName: z.string().min(1).max(100),
});

export const createClubOutputSchema = z.object({
  club: clubSchema,
  team: teamSchema,
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
  myClubs: oc
    .route({ method: "GET", path: "/my-clubs" })
    .input(myClubsInputSchema)
    .output(myClubsOutputSchema),
  createClub: oc
    .route({ method: "POST", path: "/clubs" })
    .input(createClubInputSchema)
    .output(createClubOutputSchema),
});

/** Inferred contract type — used by the frontend to create a typed oRPC client. */
export type AppRouter = typeof contract;
