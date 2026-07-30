/** Invitations granting a preset role in a club or team (ADR-004). */

import { z } from "zod";
import { guardianRelationSchema } from "./guardians.js";

export const invitationStatusSchema = z.enum([
  "active",
  "expired",
  "revoked",
  "used",
]);

export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

/** Admin-facing invitation (returned to club managers). */
export const invitationSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  teamId: z.string().nullable(),
  teamName: z.string().nullable(),
  roleId: z.string(),
  roleName: z.string(),
  email: z.string().nullable(),
  token: z.string(),
  status: invitationStatusSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
});

export type Invitation = z.infer<typeof invitationSchema>;

/** Public view of an invitation, resolved by token before sign-in. */
export const publicInvitationSchema = z.object({
  clubName: z.string(),
  teamName: z.string().nullable(),
  roleName: z.string(),
  /** When set, only this email may accept the invitation. */
  email: z.string().nullable(),
  status: invitationStatusSchema,
});

export const createInvitationInputSchema = z.object({
  clubId: z.string(),
  teamId: z.string().nullable().optional(),
  roleId: z.string(),
  email: z.string().email().nullable().optional(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
  /** When set, accepting also links the user to this member (#9). */
  memberId: z.string().nullable().optional(),
  /** Guardian relation for the member link; defaults to "guardian". */
  relation: guardianRelationSchema.optional(),
});

export const createInvitationOutputSchema = z.object({
  invitation: invitationSchema,
});

export const listInvitationsInputSchema = z.object({
  clubId: z.string(),
});

export const listInvitationsOutputSchema = z.object({
  invitations: z.array(invitationSchema),
});

export const revokeInvitationInputSchema = z.object({
  clubId: z.string(),
  invitationId: z.string(),
});

export const revokeInvitationOutputSchema = z.object({
  revoked: z.literal(true),
});

export const getInvitationInputSchema = z.object({
  token: z.string(),
});

export const getInvitationOutputSchema = z.object({
  invitation: publicInvitationSchema,
});

export const acceptInvitationInputSchema = z.object({
  token: z.string(),
});

export const acceptInvitationOutputSchema = z.object({
  clubId: z.string(),
  teamId: z.string().nullable(),
});

