/** Guardian data hooks (issue #9). */
import { useMutation, useQuery } from "@tanstack/react-query";
import type { GuardianRelation } from "@fc-app/contracts";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { orpcQuery } from "./orpc-query";

export function memberGuardiansQueryOptions(teamId: string, memberId: string) {
  return orpcQuery.listMemberGuardians.queryOptions({
    input: { teamId, memberId },
  });
}

export function useMemberGuardians(teamId: string, memberId: string) {
  return useQuery(memberGuardiansQueryOptions(teamId, memberId));
}

export function memberContactsQueryOptions(teamId: string, memberId: string) {
  return orpcQuery.listMemberContacts.queryOptions({
    input: { teamId, memberId },
  });
}

/** Imported guardians (#64) — these need no account, unlike the links above. */
export function useMemberContacts(teamId: string, memberId: string) {
  return useQuery(memberContactsQueryOptions(teamId, memberId));
}

export function clubUsersQueryOptions(teamId: string) {
  return orpcQuery.listClubUsers.queryOptions({ input: { teamId } });
}

export function useClubUsers(teamId: string) {
  return useQuery(clubUsersQueryOptions(teamId));
}

export const myMembersQueryOptions = orpcQuery.myMembers.queryOptions({
  input: {},
});

export function useMyMembers() {
  return useQuery(myMembersQueryOptions);
}

export function useAddGuardian(teamId: string, memberId: string) {
  return useMutation({
    mutationFn: (input: { userId: string; relation: GuardianRelation }) =>
      orpc.addGuardian({ teamId, memberId, ...input }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpcQuery.listMemberGuardians.key({
          input: { teamId, memberId },
        }),
      }),
  });
}

export function useRemoveGuardian(teamId: string, memberId: string) {
  return useMutation({
    mutationFn: (userId: string) =>
      orpc.removeGuardian({ teamId, memberId, userId }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpcQuery.listMemberGuardians.key({
          input: { teamId, memberId },
        }),
      }),
  });
}

export function pendingContactInvitesQueryOptions(teamId: string) {
  return orpcQuery.pendingContactInvites.queryOptions({ input: { teamId } });
}

/**
 * How many imported guardians are still out of reach (#65). Only an admin may
 * ask: the endpoint is gated on settings.club, so firing this without it would
 * be a guaranteed 403 on every roster a coach opens.
 */
export function usePendingContactInvites(teamId: string, enabled: boolean) {
  return useQuery({ ...pendingContactInvitesQueryOptions(teamId), enabled });
}

export function useInviteMemberContacts(teamId: string) {
  return useMutation({
    mutationFn: () => orpc.inviteMemberContacts({ teamId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpcQuery.pendingContactInvites.key({ input: { teamId } }),
      });
    },
  });
}
