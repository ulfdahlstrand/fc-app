/** Member import data hooks (#63). Preview only; the commit lands in #64. */
import { useMutation } from "@tanstack/react-query";
import type { ImportRow } from "@fc-app/contracts";
import { orpc } from "../orpc-client";

export function usePreviewMemberImport(teamId: string) {
  return useMutation({
    mutationFn: (rows: ImportRow[]) =>
      orpc.previewMemberImport({ teamId, rows }),
  });
}
