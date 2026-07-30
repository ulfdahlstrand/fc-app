/** Invitation data hooks (issue #6). */
import { useMutation, useQuery } from "@tanstack/react-query";
import { createInvitationInputSchema, type Permission } from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { optionalText } from "./form";
import { orpcQuery } from "./orpc-query";

/** Form schema for creating an invitation, derived from the contract's input (ADR-007). */
export const invitationFormSchema = z.object({
  roleId: z.string().trim().min(1),
  teamId: optionalText(createInvitationInputSchema.shape.teamId.unwrap()),
  email: optionalText(createInvitationInputSchema.shape.email.unwrap()),
});

/** What the inputs hold while editing (all strings). */
export type InvitationFormValues = z.input<typeof invitationFormSchema>;

/** What the API accepts, after parsing. */
export type InvitationFormOutput = z.output<typeof invitationFormSchema>;

export function invitationsQueryOptions(clubId: string) {
  return orpcQuery.listInvitations.queryOptions({ input: { clubId } });
}

export function useInvitations(clubId: string) {
  return useQuery(invitationsQueryOptions(clubId));
}

export function useCreateInvitation(clubId: string) {
  return useMutation({
    mutationFn: (input: {
      teamId?: string | null;
      roleId: string;
      email?: string | null;
      expiresInDays?: number;
    }) => orpc.createInvitation({ clubId, ...input }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpcQuery.listInvitations.key({ input: { clubId } }),
      }),
  });
}

export function useRevokeInvitation(clubId: string) {
  return useMutation({
    mutationFn: (invitationId: string) =>
      orpc.revokeInvitation({ clubId, invitationId }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpcQuery.listInvitations.key({ input: { clubId } }),
      }),
  });
}

/** Builds the shareable invite URL for a token, based on the current origin. */
export function invitationLink(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

const PENDING_INVITE_KEY = "fc-app.pending-invite";

export function setPendingInvite(token: string): void {
  localStorage.setItem(PENDING_INVITE_KEY, token);
}

export function takePendingInvite(): string | null {
  const token = localStorage.getItem(PENDING_INVITE_KEY);
  if (token) localStorage.removeItem(PENDING_INVITE_KEY);
  return token;
}

export type { Permission };
