/**
 * Guardian data hooks (issue #9).
 *
 * Guardian links are read with members.view and managed with members.manage.
 * "My members" is available to any signed-in user (the members they are
 * linked to, across clubs).
 */
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import type { GuardianRelation } from "@fc-app/contracts";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";

export function memberGuardiansQueryOptions(teamId: string, memberId: string) {
  return queryOptions({
    queryKey: ["guardians", teamId, memberId],
    queryFn: () => orpc.listMemberGuardians({ teamId, memberId }),
  });
}

export function useMemberGuardians(teamId: string, memberId: string) {
  return useQuery(memberGuardiansQueryOptions(teamId, memberId));
}

export function clubUsersQueryOptions(teamId: string) {
  return queryOptions({
    queryKey: ["clubUsers", teamId],
    queryFn: () => orpc.listClubUsers({ teamId }),
  });
}

export function useClubUsers(teamId: string) {
  return useQuery(clubUsersQueryOptions(teamId));
}

export const myMembersQueryOptions = queryOptions({
  queryKey: ["myMembers"],
  queryFn: () => orpc.myMembers({}),
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
        queryKey: ["guardians", teamId, memberId],
      }),
  });
}

export function useRemoveGuardian(teamId: string, memberId: string) {
  return useMutation({
    mutationFn: (userId: string) =>
      orpc.removeGuardian({ teamId, memberId, userId }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["guardians", teamId, memberId],
      }),
  });
}
