/** Attendance import data hooks (#84, #85). */
import { useMutation } from "@tanstack/react-query";
import type { previewAttendanceImportInputSchema } from "@fc-app/contracts";
import type { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { orpcQuery } from "./orpc-query";

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

export function useCommitAttendanceImport(teamId: string) {
  return useMutation({
    mutationFn: (input: PreviewInput) =>
      orpc.commitAttendanceImport({ teamId, ...input }),
    // A season lands in one go: the calendar gains activities, the statistics
    // gain months of marks, and the type list may have grown. Nothing
    // team-scoped that reads any of those is safe to keep.
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpcQuery.listActivities.key({ input: { teamId } }),
        }),
        queryClient.invalidateQueries({
          queryKey: orpcQuery.listActivityTypes.key({ input: { teamId } }),
        }),
        queryClient.invalidateQueries({
          queryKey: orpcQuery.dashboard.key({ input: { teamId } }),
        }),
        // Attendance and statistics are read per activity and per filter, so
        // there is no one key to name — drop the lot.
        queryClient.invalidateQueries({
          queryKey: orpcQuery.listAttendance.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: orpcQuery.attendanceStats.key(),
        }),
      ]);
    },
  });
}
