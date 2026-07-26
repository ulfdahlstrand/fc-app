/**
 * Custom member field data hooks (issue #8).
 *
 * Definitions are team-scoped and read with members.view (needed to render the
 * roster/detail); managing them requires settings.team. Field values are
 * written per member with members.manage.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createMemberFieldInputSchema,
  memberFieldTypeSchema,
  type MemberFieldType,
} from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { requiredText } from "./form";
import { orpcQuery } from "./orpc-query";

/**
 * Form schema for creating/editing a member field's scalar inputs, derived
 * from the contract's create-field input (ADR-007) — the length rules live
 * there, not here. `options` isn't included: it's a textarea parsed into a
 * string list, and "required when the type is select" is a UI rule rather
 * than a contract field, so it's kept as controlled local state alongside
 * this form (see `FieldDialog` in `routes/settings.team.tsx`). See
 * `lib/form.ts`.
 */
export const memberFieldFormSchema = z.object({
  name: requiredText(createMemberFieldInputSchema.shape.name),
  fieldType: memberFieldTypeSchema,
  required: z.boolean(),
});

/** What the inputs hold while editing. */
export type MemberFieldFormValues = z.input<typeof memberFieldFormSchema>;

/** What the API accepts, after parsing (minus `options`, added separately). */
export type MemberFieldFormOutput = z.output<typeof memberFieldFormSchema>;

export function memberFieldsQueryOptions(
  teamId: string,
  includeArchived = false
) {
  return orpcQuery.listMemberFields.queryOptions({
    input: { teamId, includeArchived },
  });
}

export function useMemberFields(teamId: string, includeArchived = false) {
  return useQuery(memberFieldsQueryOptions(teamId, includeArchived));
}

async function invalidateFields(teamId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: orpcQuery.listMemberFields.key({ input: { teamId } }),
    }),
    // Values render alongside members, so refresh those too.
    queryClient.invalidateQueries({
      queryKey: orpcQuery.listMembers.key({ input: { teamId } }),
    }),
    queryClient.invalidateQueries({
      queryKey: orpcQuery.getMember.key({ input: { teamId } }),
    }),
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
      await queryClient.invalidateQueries({
        queryKey: orpcQuery.listMembers.key({ input: { teamId } }),
      });
      await queryClient.invalidateQueries({
        queryKey: orpcQuery.getMember.key({
          input: { teamId, memberId: data.member.id },
        }),
      });
    },
  });
}
