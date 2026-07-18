/**
 * Custom member field data hooks (issue #8).
 *
 * Definitions are team-scoped and read with members.view (needed to render the
 * roster/detail); managing them requires settings.team. Field values are
 * written per member with members.manage.
 */
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import type { MemberFieldType } from "@fc-app/contracts";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";

export function memberFieldsQueryOptions(
  teamId: string,
  includeArchived = false
) {
  return queryOptions({
    queryKey: ["memberFields", teamId, includeArchived],
    queryFn: () => orpc.listMemberFields({ teamId, includeArchived }),
  });
}

export function useMemberFields(teamId: string, includeArchived = false) {
  return useQuery(memberFieldsQueryOptions(teamId, includeArchived));
}

async function invalidateFields(teamId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["memberFields", teamId] }),
    // Values render alongside members, so refresh those too.
    queryClient.invalidateQueries({ queryKey: ["members", teamId] }),
    queryClient.invalidateQueries({ queryKey: ["member", teamId] }),
  ]);
}

export function useCreateMemberField(teamId: string) {
  return useMutation({
    mutationFn: (input: {
      name: string;
      fieldType: MemberFieldType;
      options?: string[];
      required?: boolean;
    }) => orpc.createMemberField({ teamId, ...input }),
    onSuccess: () => invalidateFields(teamId),
  });
}

export function useUpdateMemberField(teamId: string) {
  return useMutation({
    mutationFn: (input: {
      fieldId: string;
      name?: string;
      options?: string[];
      required?: boolean;
      sortOrder?: number;
    }) => orpc.updateMemberField({ teamId, ...input }),
    onSuccess: () => invalidateFields(teamId),
  });
}

export function useArchiveMemberField(teamId: string) {
  return useMutation({
    mutationFn: (input: { fieldId: string; archived: boolean }) =>
      orpc.archiveMemberField({ teamId, ...input }),
    onSuccess: () => invalidateFields(teamId),
  });
}

export function useSetMemberFieldValues(teamId: string) {
  return useMutation({
    mutationFn: (input: {
      memberId: string;
      values: Record<string, string | null>;
    }) => orpc.setMemberFieldValues({ teamId, ...input }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["members", teamId] });
      await queryClient.invalidateQueries({
        queryKey: ["member", teamId, data.member.id],
      });
    },
  });
}
