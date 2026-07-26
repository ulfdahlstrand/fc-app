/**
 * Group data hooks (issue #10). All queries are team-scoped.
 */
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { createGroupInputSchema } from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { requiredText } from "./form";

/**
 * Form schema for creating/renaming a group, derived from the contract's
 * create-group input (ADR-007) — the length rules live there, not here. Both
 * create and rename share the same "name" shape. See `lib/form.ts`.
 */
export const groupFormSchema = z.object({
  name: requiredText(createGroupInputSchema.shape.name),
});

/** What the inputs hold while editing (all strings). */
export type GroupFormValues = z.input<typeof groupFormSchema>;

/** What the API accepts, after parsing. */
export type GroupNameInput = z.output<typeof groupFormSchema>;

export function groupsQueryOptions(teamId: string) {
  return queryOptions({
    queryKey: ["groups", teamId],
    queryFn: () => orpc.listGroups({ teamId }),
  });
}

export function useGroups(teamId: string) {
  return useQuery(groupsQueryOptions(teamId));
}

export function groupMembersQueryOptions(teamId: string, groupId: string) {
  return queryOptions({
    queryKey: ["groupMembers", teamId, groupId],
    queryFn: () => orpc.listGroupMembers({ teamId, groupId }),
  });
}

export function useGroupMembers(teamId: string, groupId: string) {
  return useQuery(groupMembersQueryOptions(teamId, groupId));
}

export function memberGroupsQueryOptions(teamId: string, memberId: string) {
  return queryOptions({
    queryKey: ["memberGroups", teamId, memberId],
    queryFn: () => orpc.listMemberGroups({ teamId, memberId }),
  });
}

export function useMemberGroups(teamId: string, memberId: string) {
  return useQuery(memberGroupsQueryOptions(teamId, memberId));
}

async function invalidateGroups(teamId: string): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["groups", teamId] });
}

export function useCreateGroup(teamId: string) {
  return useMutation({
    mutationFn: (name: string) => orpc.createGroup({ teamId, name }),
    onSuccess: () => invalidateGroups(teamId),
  });
}

export function useRenameGroup(teamId: string) {
  return useMutation({
    mutationFn: (input: { groupId: string; name: string }) =>
      orpc.renameGroup({ teamId, ...input }),
    onSuccess: () => invalidateGroups(teamId),
  });
}

export function useDeleteGroup(teamId: string) {
  return useMutation({
    mutationFn: (groupId: string) => orpc.deleteGroup({ teamId, groupId }),
    onSuccess: () => invalidateGroups(teamId),
  });
}

export function useSetGroupMembers(teamId: string, groupId: string) {
  return useMutation({
    mutationFn: (memberIds: string[]) =>
      orpc.setGroupMembers({ teamId, groupId, memberIds }),
    onSuccess: async () => {
      await invalidateGroups(teamId);
      await queryClient.invalidateQueries({
        queryKey: ["groupMembers", teamId, groupId],
      });
      // Member counts and group filter results may have changed.
      await queryClient.invalidateQueries({ queryKey: ["members", teamId] });
    },
  });
}
