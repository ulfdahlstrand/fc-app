/**
 * Activity data hooks (issue #12) — the calendar's rows.
 *
 * Reading needs members.view (the same permission the calendar's activity
 * types need); creating, editing and cancelling need activities.manage.
 * Activities are cancelled, never deleted, so a called-off training stays on
 * the calendar struck through.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  activityWriteFields,
  isoWeekdaySchema,
  type Activity,
  type ActivityEditScope,
} from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import {
  browserTimeZone,
  fromDateTimeInput,
  localDateOf,
  localTimeOf,
} from "./dates";
import { optionalText, requiredText } from "./form";
import { orpcQuery } from "./orpc-query";

export interface ActivityListFilters {
  /** Half-open window: `from` inclusive, `to` exclusive. */
  from?: string;
  to?: string;
  activityTypeId?: string;
  /** Narrows to a season's date range (#13). */
  seasonId?: string;
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
      ...(filters.seasonId ? { seasonId: filters.seasonId } : {}),
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
    // Recurrence (#13). The start/end above define the *first* occurrence and
    // the time of day every later one inherits.
    repeats: z.boolean(),
    weekdays: z.array(isoWeekdaySchema),
    until: z.string().trim(),
  })
  .refine(
    (value) =>
      value.endsAt === null ||
      new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(),
    { path: ["endsAt"] },
  )
  .refine((value) => !value.repeats || value.weekdays.length > 0, {
    path: ["weekdays"],
  })
  .refine((value) => !value.repeats || value.until !== "", { path: ["until"] })
  .refine(
    (value) =>
      !value.repeats ||
      value.until === "" ||
      value.until >= localDateOf(value.startsAt),
    { path: ["until"] },
  );

/** What the inputs hold while editing (all strings). */
export type ActivityFormValues = z.input<typeof activityFormSchema>;

/** The whole parsed form, before it is split into one of the two payloads. */
export type ActivityFormOutput = z.output<typeof activityFormSchema>;

/** What `createActivity`/`updateActivity` accept. */
export interface ActivityWriteInput {
  activityTypeId: string;
  title: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  notes: string | null;
}

/** What `createRecurringActivities` accepts, minus the timezone. */
export interface RecurrenceWriteInput {
  activityTypeId: string;
  title: string | null;
  location: string | null;
  notes: string | null;
  weekdays: number[];
  startTime: string;
  endTime: string | null;
  startsOn: string;
  until: string;
}

/** The single-activity payload: the form minus its recurrence fields. */
export function toActivityInput(form: ActivityFormOutput): ActivityWriteInput {
  return {
    activityTypeId: form.activityTypeId,
    title: form.title,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    location: form.location,
    notes: form.notes,
  };
}

/**
 * The series payload. The first occurrence's date becomes the series' start
 * and its time of day becomes the template's — every later occurrence is
 * generated at that wall-clock time, not at a fixed offset from the first.
 */
export function toRecurrenceInput(
  form: ActivityFormOutput,
): RecurrenceWriteInput {
  return {
    activityTypeId: form.activityTypeId,
    title: form.title,
    location: form.location,
    notes: form.notes,
    weekdays: form.weekdays,
    startTime: localTimeOf(form.startsAt),
    endTime: form.endsAt === null ? null : localTimeOf(form.endsAt),
    startsOn: localDateOf(form.startsAt),
    until: form.until,
  };
}

export function useCreateActivity(teamId: string) {
  return useMutation({
    mutationFn: (input: ActivityWriteInput) =>
      orpc.createActivity({ teamId, ...input }),
    onSuccess: (data) => invalidateActivities(teamId, data.activity.id),
  });
}

export function useUpdateActivity(teamId: string) {
  return useMutation({
    mutationFn: (
      input: ActivityWriteInput & {
        activityId: string;
        /** "following" also rewrites the rest of the series (#13). */
        scope?: ActivityEditScope;
      },
    ) => orpc.updateActivity({ teamId, ...input }),
    // A "following" edit rewrites rows this page never asked for, so the whole
    // team's activity cache goes, not just this one.
    onSuccess: (data) => invalidateActivities(teamId, data.activity.id),
  });
}

/**
 * Creates a whole series in one call (#13). The browser's IANA zone travels
 * with it: the backend generates each occurrence from its own local date, so
 * 18:00 stays 18:00 when the clocks move.
 */
export function useCreateRecurringActivities(teamId: string) {
  return useMutation({
    mutationFn: (input: RecurrenceWriteInput) =>
      orpc.createRecurringActivities({
        teamId,
        timeZone: browserTimeZone(),
        ...input,
      }),
    onSuccess: () => invalidateActivities(teamId),
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
