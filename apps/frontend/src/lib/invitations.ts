/**
 * Invitation data hooks (issue #6).
 *
 * Admin-side hooks (list/create/revoke) are club-scoped and gated server-side
 * by settings.club. The public getInvitation resolves a token before sign-in;
 * acceptInvitation joins the caller to the club/team.
 */
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import type { Permission } from "@fc-app/contracts";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";

export function invitationsQueryOptions(clubId: string) {
  return queryOptions({
    queryKey: ["invitations", clubId],
    queryFn: () => orpc.listInvitations({ clubId }),
  });
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
      queryClient.invalidateQueries({ queryKey: ["invitations", clubId] }),
  });
}

export function useRevokeInvitation(clubId: string) {
  return useMutation({
    mutationFn: (invitationId: string) =>
      orpc.revokeInvitation({ clubId, invitationId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["invitations", clubId] }),
  });
}

/** Builds the shareable invite URL for a token, based on the current origin. */
export function invitationLink(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

// --- Pending invite across the OAuth redirect -------------------------------
//
// Google sign-in returns to the app root, losing the invite context. The
// invite page stashes its token here before starting sign-in; the index
// route reads it back and redirects the freshly signed-in user to the invite.

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
