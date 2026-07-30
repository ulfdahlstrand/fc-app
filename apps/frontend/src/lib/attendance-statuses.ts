/** Attendance status hooks (issue #14) — statuses are team configuration. */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  activityColourSchema,
  createAttendanceStatusInputSchema,
  type ActivityColour,
} from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { requiredText } from "./form";
import { orpcQuery } from "./orpc-query";

/**
 * Form schema for the create/edit dialog, derived from the contract's create
 * input (ADR-007) so the length rules live there, not here.
 */
export const attendanceStatusFormSchema = z.object({
  name: requiredText(createAttendanceStatusInputSchema.shape.name),
  colour: activityColourSchema,
  countsAsPresent: z.boolean(),
});

/** What the inputs hold while editing. */
export type AttendanceStatusFormValues = z.input<
  typeof attendanceStatusFormSchema
>;

/** What the API accepts, after parsing. */
export type AttendanceStatusFormOutput = z.output<
  typeof attendanceStatusFormSchema
>;

export function attendanceStatusesQueryOptions(
  teamId: string,
  includeArchived = false
) {
  return orpcQuery.listAttendanceStatuses.queryOptions({
    input: { teamId, includeArchived },
  });
}

export function useAttendanceStatuses(teamId: string, includeArchived = false) {
  return useQuery(attendanceStatusesQueryOptions(teamId, includeArchived));
}

async function invalidateAttendanceStatuses(teamId: string): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: orpcQuery.listAttendanceStatuses.key({ input: { teamId } }),
  });
}

export function useCreateAttendanceStatus(teamId: string) {
  return useMutation({
    mutationFn: (input: {
      name: string;
      colour?: ActivityColour;
      countsAsPresent?: boolean;
    }) => orpc.createAttendanceStatus({ teamId, ...input }),
    onSuccess: () => invalidateAttendanceStatuses(teamId),
  });
}

export function useUpdateAttendanceStatus(teamId: string) {
  return useMutation({
    mutationFn: (input: {
      attendanceStatusId: string;
      name?: string;
      colour?: ActivityColour;
      countsAsPresent?: boolean;
      sortOrder?: number;
    }) => orpc.updateAttendanceStatus({ teamId, ...input }),
    onSuccess: () => invalidateAttendanceStatuses(teamId),
  });
}

export function useArchiveAttendanceStatus(teamId: string) {
  return useMutation({
    mutationFn: (input: { attendanceStatusId: string; archived: boolean }) =>
      orpc.archiveAttendanceStatus({ teamId, ...input }),
    onSuccess: () => invalidateAttendanceStatuses(teamId),
  });
}
