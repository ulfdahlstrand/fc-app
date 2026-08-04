/** Member import data hooks (#63, #64). */
import { useMutation } from "@tanstack/react-query";
import type { ImportRow } from "@fc-app/contracts";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { orpcQuery } from "./orpc-query";

export function usePreviewMemberImport(teamId: string) {
  return useMutation({
    mutationFn: (rows: ImportRow[]) =>
      orpc.previewMemberImport({ teamId, rows }),
  });
}

export function useCommitMemberImport(teamId: string) {
  return useMutation({
    mutationFn: (rows: ImportRow[]) => orpc.commitMemberImport({ teamId, rows }),
    // The import can touch the roster, its groups and its custom fields at
    // once, so nothing team-scoped is safe to keep.
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpcQuery.listMembers.key({ input: { teamId } }),
      });
      await queryClient.invalidateQueries({
        queryKey: orpcQuery.listGroups.key({ input: { teamId } }),
      });
      await queryClient.invalidateQueries({
        queryKey: orpcQuery.listMemberFields.key({ input: { teamId } }),
      });
    },
  });
}
