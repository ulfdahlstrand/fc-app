import { z } from "zod";

import { permissionSchema } from "./permissions.js";

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
