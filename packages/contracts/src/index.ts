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
// Permission catalog (ADR-005)
//
// The catalog is fixed in code — adding a permission is a code change — while
// which permissions a role has is club-configurable data. Shared here so the
// frontend can gate UI on the same identifiers the backend enforces.
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  "members.view",
  "members.manage",
  "activities.manage",
  "attendance.record",
  "callups.manage",
  "callups.respond",
  "posts.manage",
  "tracking.manage",
  "settings.team",
  "settings.club",
] as const;

export const permissionSchema = z.enum(PERMISSIONS);

export type Permission = z.infer<typeof permissionSchema>;

// ---------------------------------------------------------------------------
// Roles — Zod schemas (ADR-005)
//
// Roles are named permission sets per club. Seeded system roles carry a
// systemKey; the admin role is immutable (always all permissions) so a club
// cannot lock itself out.
// ---------------------------------------------------------------------------

export const roleSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  name: z.string(),
  /** Set for seeded roles (admin | coach | player | guardian); null for custom roles. */
  systemKey: z.string().nullable(),
  permissions: z.array(permissionSchema),
  /** Number of memberships currently using the role. */
  memberCount: z.number(),
});

export type Role = z.infer<typeof roleSchema>;

export const listRolesInputSchema = z.object({
  clubId: z.string(),
});

export const listRolesOutputSchema = z.object({
  roles: z.array(roleSchema),
});

export const createRoleInputSchema = z.object({
  clubId: z.string(),
  name: z.string().min(1).max(50),
  permissions: z.array(permissionSchema),
});

export const createRoleOutputSchema = z.object({
  role: roleSchema,
});

export const updateRoleInputSchema = z.object({
  clubId: z.string(),
  roleId: z.string(),
  name: z.string().min(1).max(50).optional(),
  permissions: z.array(permissionSchema).optional(),
});

export const updateRoleOutputSchema = z.object({
  role: roleSchema,
});

export const deleteRoleInputSchema = z.object({
  clubId: z.string(),
  roleId: z.string(),
});

export const deleteRoleOutputSchema = z.object({
  deleted: z.literal(true),
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

/** A team with the caller's effective role and permissions in it. */
export const myTeamSchema = teamSchema.extend({
  role: z.string(),
  permissions: z.array(permissionSchema),
});

export type MyTeam = z.infer<typeof myTeamSchema>;

export const myClubSchema = clubSchema.extend({
  /** The caller's club-wide role name, or null when only team-scoped memberships exist. */
  role: z.string().nullable(),
  /** Permissions of the club-wide role; empty without a club-wide membership. */
  permissions: z.array(permissionSchema),
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
  listRoles: oc
    .route({ method: "GET", path: "/roles" })
    .input(listRolesInputSchema)
    .output(listRolesOutputSchema),
  createRole: oc
    .route({ method: "POST", path: "/roles" })
    .input(createRoleInputSchema)
    .output(createRoleOutputSchema),
  updateRole: oc
    .route({ method: "POST", path: "/roles/update" })
    .input(updateRoleInputSchema)
    .output(updateRoleOutputSchema),
  deleteRole: oc
    .route({ method: "POST", path: "/roles/delete" })
    .input(deleteRoleInputSchema)
    .output(deleteRoleOutputSchema),
});

/** Inferred contract type — used by the frontend to create a typed oRPC client. */
export type AppRouter = typeof contract;
