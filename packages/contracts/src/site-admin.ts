/**
 * Site administration (ADR-025): whoever runs the installation creates an
 * account outright — address and password chosen for the person — and places
 * it in a club with a role. The one path where an address is trusted without a
 * link sent to it, which is why only a site admin may take it.
 */

import { z } from "zod";
import { accountEmailSchema, passwordSchema } from "./auth.js";

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

export type SiteAdminClub = z.infer<typeof siteAdminClubOutputSchema>;
export type SiteAdminCreateUserInput = z.infer<
  typeof siteAdminCreateUserInputSchema
>;
