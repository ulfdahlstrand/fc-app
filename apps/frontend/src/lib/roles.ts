/**
 * Role management data hooks (issue #5).
 *
 * Roles are scoped to a club; the query key includes the club id so switching
 * clubs fetches the right set. Mutations invalidate both the roles list and
 * myClubs (a permission change can affect the caller's own gating).
 */
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import type { Permission } from "@fc-app/contracts";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";

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
