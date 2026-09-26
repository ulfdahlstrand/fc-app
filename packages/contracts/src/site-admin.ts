/**
 * Site administration (ADR-025, ADR-026): whoever runs the installation
 * creates an account outright — address and password chosen for the person —
 * and places it in a club with a role, sees every account in the installation,
 * and replaces the password of one that has one. The one path where an address
 * is trusted without a link sent to it, which is why only a site admin may
 * take it.
 */

import { z } from "zod";
import { accountEmailSchema, passwordSchema } from "./auth.js";
import { isoInstantSchema } from "./common.js";

/** What the create form needs from a club: its roles and its teams. */
export const siteAdminClubInputSchema = z.object({
  clubId: z.string(),
});

export const siteAdminClubOutputSchema = z.object({
  roles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      /** admin | coach | player | guardian for seeded roles; null for custom ones. */
      systemKey: z.string().nullable(),
    })
  ),
  teams: z.array(z.object({ id: z.string(), name: z.string() })),
});

export const siteAdminCreateUserInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: accountEmailSchema,
  password: passwordSchema,
  clubId: z.string(),
  roleId: z.string(),
  /** null = the whole club; set = one team (ADR-003). */
  teamId: z.string().nullable(),
});

export const siteAdminCreateUserOutputSchema = z.object({
  userId: z.string(),
});

// ---------------------------------------------------------------------------
// The account list, and setting a password on one of them (ADR-026).
// ---------------------------------------------------------------------------

/** Matched against name and address, case-insensitively. Empty = everyone. */
export const siteAdminUsersInputSchema = z.object({
  search: z.string().trim().max(100).default(""),
});

export const siteAdminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  /**
   * How the person gets in. Both can be true — a Google account that later
   * followed a reset link — and both can be false for an account that was
   * invited but has never signed in.
   */
  hasPassword: z.boolean(),
  hasGoogle: z.boolean(),
  isSiteAdmin: z.boolean(),
  createdAt: isoInstantSchema,
  /** Every club and team the account belongs to, for telling people apart. */
  memberships: z.array(
    z.object({
      clubName: z.string(),
      /** null = the whole club (ADR-003). */
      teamName: z.string().nullable(),
      roleName: z.string(),
    })
  ),
});

export const siteAdminUsersOutputSchema = z.object({
  users: z.array(siteAdminUserSchema),
  /** True when the search matched more accounts than were returned. */
  truncated: z.boolean(),
  /** Whether a never-used account can be activated (ADR-027). */
  activationEnabled: z.boolean(),
});

/**
 * Replaces the password of an account that already has one, or gives a first
 * one to an account that has never been used — neither a password nor Google —
 * which activates it when ENABLE_ACCOUNT_ACTIVATION is on (ADR-027). Never
 * adds one to a Google-only account: its owner proved the address to Google
 * and nobody else may put a password on it (ADR-024, ADR-026).
 */
export const siteAdminSetPasswordInputSchema = z.object({
  userId: z.string(),
  password: passwordSchema,
});

export const siteAdminSetPasswordOutputSchema = z.object({
  /** Sessions ended by the change — the account is signed out everywhere. */
  sessionsEnded: z.number(),
});

export type SiteAdminClub = z.infer<typeof siteAdminClubOutputSchema>;
export type SiteAdminCreateUserInput = z.infer<
  typeof siteAdminCreateUserInputSchema
>;
export type SiteAdminUser = z.infer<typeof siteAdminUserSchema>;
