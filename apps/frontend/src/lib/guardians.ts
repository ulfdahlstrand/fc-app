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
