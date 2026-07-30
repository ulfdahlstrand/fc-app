import { z } from "zod";

import { isoInstantSchema, queryBooleanSchema } from "./common.js";
import { ActivityColour, activityColourSchema } from "./groups.js";

// Attendance statuses (issue #14, ADR-005)
//
// Statuses are team configuration, not code: seeded with Present, Absent and
// Ill, and a team adds its own ("Late", "Injured"). They share the Kit palette
// tokens with activity types — three colour families and nothing else.
//
// `countsAsPresent` is what statistics (#15) sums. It is a separate flag
// rather than an inference from the name, because a team may well decide that
// "Late" counts and "Injured" does not, and neither name says so.
// ---------------------------------------------------------------------------

export const attendanceStatusSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  colour: activityColourSchema,
  countsAsPresent: z.boolean(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
});

export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

/**
 * The statuses every new team starts with (ADR-005). Ordinary rows, editable
 * afterwards — the order here is the order a coach taps through.
 */
export const DEFAULT_ATTENDANCE_STATUSES: readonly {
  name: string;
  colour: ActivityColour;
  countsAsPresent: boolean;
}[] = [
  { name: "Present", colour: "green", countsAsPresent: true },
  { name: "Absent", colour: "orange", countsAsPresent: false },
  { name: "Ill", colour: "amber", countsAsPresent: false },
];

export const listAttendanceStatusesInputSchema = z.object({
  teamId: z.string(),
  includeArchived: queryBooleanSchema.optional(),
});

export const listAttendanceStatusesOutputSchema = z.object({
  attendanceStatuses: z.array(attendanceStatusSchema),
});

export const createAttendanceStatusInputSchema = z.object({
  teamId: z.string(),
  name: z.string().min(1).max(100),
  colour: activityColourSchema.optional(),
  countsAsPresent: z.boolean().optional(),
});

export const createAttendanceStatusOutputSchema = z.object({
  attendanceStatus: attendanceStatusSchema,
});

export const updateAttendanceStatusInputSchema = z.object({
  teamId: z.string(),
  attendanceStatusId: z.string(),
  name: z.string().min(1).max(100).optional(),
  colour: activityColourSchema.optional(),
  countsAsPresent: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateAttendanceStatusOutputSchema = z.object({
  attendanceStatus: attendanceStatusSchema,
});

export const archiveAttendanceStatusInputSchema = z.object({
  teamId: z.string(),
  attendanceStatusId: z.string(),
  archived: z.boolean(),
});

export const archiveAttendanceStatusOutputSchema = z.object({
  attendanceStatus: attendanceStatusSchema,
});

// ---------------------------------------------------------------------------
// Attendance records (issue #14)
//
// One record per member per activity, or none at all — an unmarked member is
// the absence of a row, not a status called "unknown". In Kit that state is a
// dashed ring, and dashed always means "not decided yet".
//
// Recording is a bulk write: the coach marks the roster standing at the side
// of the pitch and saves once, rather than firing a request per tap on a
// connection that may not be there.
// ---------------------------------------------------------------------------

export const attendanceRecordSchema = z.object({
  activityId: z.string(),
  memberId: z.string(),
  statusId: z.string(),
  note: z.string().nullable(),
});

export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>;

export const listAttendanceInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
});

export const listAttendanceOutputSchema = z.object({
  records: z.array(attendanceRecordSchema),
});

/** A `null` status clears the member's mark, putting them back to unmarked. */
export const attendanceEntrySchema = z.object({
  memberId: z.string(),
  statusId: z.string().nullable(),
  note: z.string().max(500).nullable().optional(),
});

export const setAttendanceInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
  entries: z.array(attendanceEntrySchema),
});

export const setAttendanceOutputSchema = z.object({
  records: z.array(attendanceRecordSchema),
});

// ---------------------------------------------------------------------------
// Attendance statistics (issue #15)
//
// The rate is **attended ÷ marked**, not attended ÷ activities held. A session
// nobody took attendance at is unknown, not an absence, and counting it would
// quietly punish every member for the coach's forgotten phone. `activities` in
// the output is what the filters selected, so the gap between it and `marked`
// is exactly the coverage a coach may want to close.
//
// Cancelled activities are excluded everywhere — a called-off training is not
// a session anyone failed to attend.
// ---------------------------------------------------------------------------

export const attendanceStatsFilterSchema = z.object({
  teamId: z.string(),
  from: isoInstantSchema.optional(),
  to: isoInstantSchema.optional(),
  seasonId: z.string().optional(),
  activityTypeId: z.string().optional(),
  groupId: z.string().optional(),
});

export const memberAttendanceStatsSchema = z.object({
  memberId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  /** Marked with a status whose `countsAsPresent` is set. */
  attended: z.number().int(),
  /** Marked with any status — the denominator of `rate`. */
  marked: z.number().int(),
  /** null when nothing is marked yet: no rate can be honestly stated. */
  rate: z.number().nullable(),
});

export type MemberAttendanceStats = z.infer<typeof memberAttendanceStatsSchema>;

export const attendanceStatsOutputSchema = z.object({
  members: z.array(memberAttendanceStatsSchema),
  /** Activities the filters selected, cancelled ones excluded. */
  activities: z.number().int(),
  /** Attendance rate across the whole selection. */
  teamRate: z.number().nullable(),
});

/** One activity as it appears in a member's attendance history. */
export const memberAttendanceEntrySchema = z.object({
  activityId: z.string(),
  startsAt: isoInstantSchema,
  title: z.string().nullable(),
  activityTypeId: z.string(),
  /** null when the activity was held but this member was never marked. */
  statusId: z.string().nullable(),
});

export type MemberAttendanceEntry = z.infer<
  typeof memberAttendanceEntrySchema
>;

export const memberAttendanceInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
  /** Most recent first; the member page shows a window, not a career. */
  limit: z.number().int().min(1).max(200).optional(),
});

export const memberAttendanceOutputSchema = z.object({
  entries: z.array(memberAttendanceEntrySchema),
  stats: memberAttendanceStatsSchema,
});

/**
 * A member is worth a word when they are marked often enough for the number to
 * mean something and still below this. Kit's own sample screen flags 64% and
 * 71% as "at risk", so the line sits just above those.
 *
 * It lives in the contract because two sides count it: the statistics page
 * (#15) flags the rows, and the dashboard (#20) counts them server-side. A
 * threshold that drifted between them would put a number on the dashboard that
 * the page it links to disagrees with.
 */
export const AT_RISK_RATE = 75;
export const AT_RISK_MIN_MARKED = 3;

export function isAtRisk(member: {
  rate: number | null;
  marked: number;
}): boolean {
  return (
    member.rate !== null &&
    member.marked >= AT_RISK_MIN_MARKED &&
    member.rate < AT_RISK_RATE
  );
}

// ---------------------------------------------------------------------------
