/**
 * Activity data hooks (issue #12) — the calendar's rows.
 *
 * Reading needs members.view (the same permission the calendar's activity
 * types need); creating, editing and cancelling need activities.manage.
 * Activities are cancelled, never deleted, so a called-off training stays on
 * the calendar struck through.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { activityWriteFields, type Activity } from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { fromDateTimeInput } from "./dates";
import { optionalText, requiredText } from "./form";
import { orpcQuery } from "./orpc-query";

export interface ActivityListFilters {
  /** Half-open window: `from` inclusive, `to` exclusive. */
  from?: string;
  to?: string;
  activityTypeId?: string;
}

export function activitiesQueryOptions(
  teamId: string,
  filters: ActivityListFilters = {},
) {
  // Only send the filters that are set — the API rejects blank ones.
  return orpcQuery.listActivities.queryOptions({
    input: {
      teamId,
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      ...(filters.activityTypeId
        ? { activityTypeId: filters.activityTypeId }
        : {}),
    },
  });
}

export function useActivities(
  teamId: string,
  filters: ActivityListFilters = {},
) {
  return useQuery(activitiesQueryOptions(teamId, filters));
}

export function activityQueryOptions(teamId: string, activityId: string) {
  return orpcQuery.getActivity.queryOptions({ input: { teamId, activityId } });
}

export function useActivity(teamId: string, activityId: string) {
  return useQuery(activityQueryOptions(teamId, activityId));
}

async function invalidateActivities(
  teamId: string,
  activityId?: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: orpcQuery.listActivities.key({ input: { teamId } }),
  });
  if (activityId !== undefined) {
    await queryClient.invalidateQueries({
      queryKey: orpcQuery.getActivity.key({ input: { teamId, activityId } }),
    });
  }
}

/**
 * A required `<input type="datetime-local">`: the input holds local wall time
 * with no zone ("2026-08-01T17:30"), so it is resolved in the browser's zone
 * before it is piped into the contract's ISO instant.
 *
 * The NaN guard has to come first — `toISOString()` on an unparseable date
 * throws, and a thrown error is not a validation message.
 */
function requiredDateTime<T extends z.ZodType<unknown, string>>(field: T) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()))
    .transform(fromDateTimeInput)
    .pipe(field);
}

/** The same, but a blank input means "open-ended", not "invalid". */
function optionalDateTime<T extends z.ZodType<unknown, string | null>>(
  field: T,
) {
  return z
    .string()
    .trim()
    .refine((value) => value === "" || !Number.isNaN(new Date(value).getTime()))
    .transform((value) => (value === "" ? null : fromDateTimeInput(value)))
    .pipe(field);
}

/**
 * Form schema for the create/edit dialog, derived from the contract's write
 * fields (ADR-007). The cross-field rule is restated here rather than reused
 * from the contract because it has to run against the *parsed* instants, and
 * because the form needs the message on the `endsAt` field.
 */
export const activityFormSchema = z
  .object({
    activityTypeId: requiredText(activityWriteFields.activityTypeId),
    title: optionalText(activityWriteFields.title),
    startsAt: requiredDateTime(activityWriteFields.startsAt),
    endsAt: optionalDateTime(activityWriteFields.endsAt),
    location: optionalText(activityWriteFields.location),
    notes: optionalText(activityWriteFields.notes),
  })
  .refine(
    (value) =>
      value.endsAt === null ||
      new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(),
    { path: ["endsAt"] },
  );

/** What the inputs hold while editing (all strings). */
export type ActivityFormValues = z.input<typeof activityFormSchema>;

/** What the API accepts, after parsing. */
export type ActivityWriteInput = z.output<typeof activityFormSchema>;

export function useCreateActivity(teamId: string) {
  return useMutation({
    mutationFn: (input: ActivityWriteInput) =>
      orpc.createActivity({ teamId, ...input }),
    onSuccess: (data) => invalidateActivities(teamId, data.activity.id),
  });
}

export function useUpdateActivity(teamId: string) {
  return useMutation({
    mutationFn: (input: ActivityWriteInput & { activityId: string }) =>
      orpc.updateActivity({ teamId, ...input }),
    onSuccess: (data) => invalidateActivities(teamId, data.activity.id),
  });
}

export function useSetActivityCancelled(teamId: string) {
  return useMutation({
    mutationFn: (input: { activityId: string; cancelled: boolean }) =>
      orpc.setActivityCancelled({ teamId, ...input }),
    onSuccess: (data) => invalidateActivities(teamId, data.activity.id),
  });
}

/** The headline an activity shows: its own title, or its type's name. */
export function activityTitle(
  activity: Activity,
  typeName: string | undefined,
): string {
  return activity.title ?? typeName ?? "";
}
