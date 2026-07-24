/**
 * Member roster data hooks (issue #7).
 *
 * All queries are team-scoped; the query key includes the team id so switching
 * teams fetches the right roster. Mutations invalidate the team's member
 * queries.
 */
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { memberWriteFields } from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { optionalNumber, optionalText, requiredText } from "./form";

export interface MemberListFilters {
  includeArchived?: boolean;
  search?: string;
  groupId?: string;
}

export function membersQueryOptions(teamId: string, filters: MemberListFilters) {
  return queryOptions({
    queryKey: ["members", teamId, filters],
    queryFn: () =>
      orpc.listMembers({
        teamId,
        ...(filters.includeArchived !== undefined
          ? { includeArchived: filters.includeArchived }
          : {}),
        ...(filters.search ? { search: filters.search } : {}),
        ...(filters.groupId ? { groupId: filters.groupId } : {}),
      }),
  });
}

export function useMembers(teamId: string, filters: MemberListFilters) {
  return useQuery(membersQueryOptions(teamId, filters));
}

export function memberQueryOptions(teamId: string, memberId: string) {
  return queryOptions({
    queryKey: ["member", teamId, memberId],
    queryFn: () => orpc.getMember({ teamId, memberId }),
  });
}

export function useMember(teamId: string, memberId: string) {
  return useQuery(memberQueryOptions(teamId, memberId));
}

async function invalidateMembers(teamId: string): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["members", teamId] });
}

/**
 * Form schema for creating/editing a member, derived from the contract's write
 * fields (ADR-007) — the length, range and email rules live there, not here.
 * See `lib/form.ts` for the pattern.
 */
export const memberFormSchema = z.object({
  firstName: requiredText(memberWriteFields.firstName),
  lastName: requiredText(memberWriteFields.lastName),
  birthYear: optionalNumber(memberWriteFields.birthYear),
  email: optionalText(memberWriteFields.email),
  phone: optionalText(memberWriteFields.phone),
});

/** What the inputs hold while editing (all strings). */
export type MemberFormValues = z.input<typeof memberFormSchema>;

/** What the API accepts, after parsing. */
export type MemberWriteInput = z.output<typeof memberFormSchema>;

export function useCreateMember(teamId: string) {
  return useMutation({
    mutationFn: (input: MemberWriteInput) =>
      orpc.createMember({ teamId, ...input }),
    onSuccess: () => invalidateMembers(teamId),
  });
}

export function useUpdateMember(teamId: string) {
  return useMutation({
    mutationFn: (input: MemberWriteInput & { memberId: string }) =>
      orpc.updateMember({ teamId, ...input }),
    onSuccess: async (data) => {
      await invalidateMembers(teamId);
      await queryClient.invalidateQueries({
        queryKey: ["member", teamId, data.member.id],
      });
    },
  });
}

export function useSetMemberArchived(teamId: string) {
  return useMutation({
    mutationFn: (input: { memberId: string; archived: boolean }) =>
      orpc.setMemberArchived({ teamId, ...input }),
    onSuccess: async (data) => {
      await invalidateMembers(teamId);
      await queryClient.invalidateQueries({
        queryKey: ["member", teamId, data.member.id],
      });
    },
  });
}
