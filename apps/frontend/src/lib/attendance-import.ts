/** Attendance import data hooks (#84). */
import { useMutation } from "@tanstack/react-query";
import type { previewAttendanceImportInputSchema } from "@fc-app/contracts";
import type { z } from "zod";
import { orpc } from "../orpc-client";

type PreviewInput = Omit<
  z.infer<typeof previewAttendanceImportInputSchema>,
  "teamId"
>;

export function usePreviewAttendanceImport(teamId: string) {
  return useMutation({
    mutationFn: (input: PreviewInput) =>
      orpc.previewAttendanceImport({ teamId, ...input }),
  });
}
