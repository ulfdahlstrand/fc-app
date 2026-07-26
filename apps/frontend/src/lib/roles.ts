/**
 * Role management data hooks (issue #5).
 *
 * Roles are scoped to a club; the query key includes the club id so switching
 * clubs fetches the right set. Mutations invalidate both the roles list and
 * myClubs (a permission change can affect the caller's own gating).
 */
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { createRoleInputSchema, type Permission } from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { requiredText } from "./form";

/**
 * Form schema for a role's name, derived from the contract's create-role
 * input (ADR-007) — the length rules live there, not here. Both create and
 * edit share the same "name" shape; the permissions matrix isn't a good fit
 * for react-hook-form (it's a toggle array, not a validated text field), so
 * it's kept as controlled local state alongside this form. See `lib/form.ts`.
 */
export const roleFormSchema = z.object({
  name: requiredText(createRoleInputSchema.shape.name),
});

/** What the input holds while editing (a string). */
export type RoleFormValues = z.input<typeof roleFormSchema>;

/** What the API accepts, after parsing. */
export type RoleNameInput = z.output<typeof roleFormSchema>;

export function rolesQueryOptions(clubId: string) {
  return queryOptions({
    queryKey: ["roles", clubId],
    queryFn: () => orpc.listRoles({ clubId }),
  });
}

export function useRoles(clubId: string) {
  return useQuery(rolesQueryOptions(clubId));
}

async function invalidateRoles(clubId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["roles", clubId] }),
    queryClient.invalidateQueries({ queryKey: ["myClubs"] }),
  ]);
}

export function useCreateRole(clubId: string) {
  return useMutation({
    mutationFn: (input: { name: string; permissions: Permission[] }) =>
      orpc.createRole({ clubId, ...input }),
    onSuccess: () => invalidateRoles(clubId),
  });
}

export function useUpdateRole(clubId: string) {
  return useMutation({
    mutationFn: (input: {
      roleId: string;
      name?: string;
      permissions?: Permission[];
    }) => orpc.updateRole({ clubId, ...input }),
    onSuccess: () => invalidateRoles(clubId),
  });
}

export function useDeleteRole(clubId: string) {
  return useMutation({
    mutationFn: (roleId: string) => orpc.deleteRole({ clubId, roleId }),
    onSuccess: () => invalidateRoles(clubId),
  });
}
