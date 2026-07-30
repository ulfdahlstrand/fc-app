import { z } from "zod";

import { isoInstantSchema } from "./common.js";

// Activities (issue #12)
//
// The calendar is the team's hub: trainings, matches and whatever else a team
// invents, all typed by a team-configured activity type (#11).
//
// Instants cross the wire as ISO 8601 strings with an offset — the client
// composes them from local wall time, the database stores timestamptz, and
// nothing in between has to agree on a timezone. Activities are cancelled,
// never deleted: a cancelled training still has to show up (struck through) so
// nobody turns up at the pitch for it.
// ---------------------------------------------------------------------------

export const activitySchema = z.object({
  id: z.string(),
  teamId: z.string(),
  activityTypeId: z.string(),
  /** Set when the activity came from a recurring series (#13). */
  seriesId: z.string().nullable(),
  /** Optional headline ("vs. Skiljebo SK"); falls back to the type name. */
  title: z.string().nullable(),
  startsAt: isoInstantSchema,
  /** Open-ended activities are allowed — a team party has no set finish. */
  endsAt: isoInstantSchema.nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  cancelled: z.boolean(),
});

export type Activity = z.infer<typeof activitySchema>;

/** An end that precedes its start is a typo, not a schedule. */
function endsAfterStart(value: {
  startsAt: string;
  endsAt?: string | null | undefined;
}): boolean {
  return (
    value.endsAt === undefined ||
    value.endsAt === null ||
    new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime()
  );
}

const ENDS_BEFORE_START = {
  path: ["endsAt"],
  error: "The end time must come after the start time",
};

/**
 * `from`/`to` bound the window the calendar is showing — a month grid asks for
 * its own six weeks, the list view for a wider span. Both are optional; without
 * them the whole history comes back, which is fine for a team's first season
 * and cheap to page later.
 */
export const listActivitiesInputSchema = z.object({
  teamId: z.string(),
  from: isoInstantSchema.optional(),
  to: isoInstantSchema.optional(),
  activityTypeId: z.string().optional(),
  /** Narrows to a season's date range (#13); combines with `from`/`to`. */
  seasonId: z.string().optional(),
});

export const listActivitiesOutputSchema = z.object({
  activities: z.array(activitySchema),
});

export const getActivityInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
});

export const getActivityOutputSchema = z.object({
  activity: activitySchema,
});

/**
 * Fields accepted when creating or updating an activity. Exported so the
 * frontend derives its form validation from the same rules the API enforces
 * (ADR-007) instead of restating them.
 */
export const activityWriteFields = {
  activityTypeId: z.string().min(1),
  title: z.string().max(100).nullable(),
  startsAt: isoInstantSchema,
  endsAt: isoInstantSchema.nullable(),
  location: z.string().max(200).nullable(),
  notes: z.string().max(2000).nullable(),
};

export const createActivityInputSchema = z
  .object({
    teamId: z.string(),
    activityTypeId: activityWriteFields.activityTypeId,
    title: activityWriteFields.title.optional(),
    startsAt: activityWriteFields.startsAt,
    endsAt: activityWriteFields.endsAt.optional(),
    location: activityWriteFields.location.optional(),
    notes: activityWriteFields.notes.optional(),
  })
  .refine(endsAfterStart, ENDS_BEFORE_START);

export const createActivityOutputSchema = z.object({
  activity: activitySchema,
});

/**
 * Every field is optional, so start/end cannot be checked against each other
 * here — a request may change only one of them. The handler validates the
 * merged row instead.
 */
/**
 * Which occurrences an edit reaches (#13).
 *
 * `occurrence` is the default and the only meaningful value for a one-off.
 * `following` also rewrites every later occurrence in the same series *and*
 * the series template — see `updateActivity` for exactly what carries over.
 */
export const activityEditScopeSchema = z.enum(["occurrence", "following"]);

export type ActivityEditScope = z.infer<typeof activityEditScopeSchema>;

export const updateActivityInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
  scope: activityEditScopeSchema.optional(),
  activityTypeId: activityWriteFields.activityTypeId.optional(),
  title: activityWriteFields.title.optional(),
  startsAt: activityWriteFields.startsAt.optional(),
  endsAt: activityWriteFields.endsAt.optional(),
  location: activityWriteFields.location.optional(),
  notes: activityWriteFields.notes.optional(),
});

export const updateActivityOutputSchema = z.object({
  activity: activitySchema,
});

export const setActivityCancelledInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
  cancelled: z.boolean(),
});

export const setActivityCancelledOutputSchema = z.object({
  activity: activitySchema,
});

// ---------------------------------------------------------------------------
// Recurring activities (issue #13, ADR-008)
//
// A series is a **template**; the occurrences it generates are ordinary
// activities carrying `seriesId`. The template holds **local wall time**, not
// instants — a training is at 18:00 in the club's own timezone on both sides
// of a DST change — so it stores a time-of-day, a set of weekdays, a date
// range, and the IANA zone those are read in.
// ---------------------------------------------------------------------------

/** ISO weekday: 1 = Monday … 7 = Sunday, matching date-fns' `getISODay`. */
export const isoWeekdaySchema = z.number().int().min(1).max(7);

/** A local wall-clock time, "HH:mm" — never an instant. */
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** A local calendar date, "YYYY-MM-DD". */
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const activitySeriesSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  activityTypeId: z.string(),
  title: z.string().nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  weekdays: z.array(isoWeekdaySchema),
  startTime: localTimeSchema,
  endTime: localTimeSchema.nullable(),
  startsOn: localDateSchema,
  until: localDateSchema,
  timeZone: z.string(),
});

export type ActivitySeries = z.infer<typeof activitySeriesSchema>;

/**
 * A ceiling on one series. "Every Tuesday until 2099" is a typo, not a plan,
 * and generating it would put a hundred thousand rows on the calendar.
 */
export const MAX_SERIES_OCCURRENCES = 400;

export const createRecurringActivitiesInputSchema = z
  .object({
    teamId: z.string(),
    activityTypeId: activityWriteFields.activityTypeId,
    title: activityWriteFields.title.optional(),
    location: activityWriteFields.location.optional(),
    notes: activityWriteFields.notes.optional(),
    weekdays: z.array(isoWeekdaySchema).min(1),
    startTime: localTimeSchema,
    endTime: localTimeSchema.nullable().optional(),
    startsOn: localDateSchema,
    until: localDateSchema,
    /** The club's zone, e.g. "Europe/Stockholm" — the browser's own. */
    timeZone: z.string().min(1),
  })
  .refine((value) => value.until >= value.startsOn, {
    path: ["until"],
    error: "The last date must not precede the first",
  })
  .refine(
    (value) =>
      value.endTime === undefined ||
      value.endTime === null ||
      value.endTime > value.startTime,
    { path: ["endTime"], error: "The end time must come after the start time" }
  );

export const createRecurringActivitiesOutputSchema = z.object({
  series: activitySeriesSchema,
  activities: z.array(activitySchema),
});

// ---------------------------------------------------------------------------
