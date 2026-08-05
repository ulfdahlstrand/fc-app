/**
 * Importing a season's attendance history (#84).
 *
 * Attendance cannot arrive alone: a record hangs off an activity, and a team
 * importing last spring has no activities for last spring. So the import
 * carries both, and the run that writes the marks writes the trainings they
 * belong to.
 *
 * The source is parsed in the browser and the *structured* rows are sent —
 * never the file. oRPC stays plain JSON with no multipart path to maintain
 * (ADR-001).
 *
 * Preview writes nothing. It exists so a coach can see exactly what a commit
 * would do before anything happens.
 */

import { z } from "zod";
import { activityColourSchema } from "./groups.js";

/** A season is a few dozen activities; past this it is a different problem. */
export const MAX_IMPORT_ACTIVITIES = 200;
export const MAX_IMPORT_MEMBERS = 200;
export const MAX_IMPORT_MARKS = 10_000;

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTimeSchema = z.string().regex(/^\d{2}:\d{2}$/);

/**
 * One activity the source describes. `externalRef` is the exporting system's
 * own id — the only key that survives two activities starting at the same
 * instant, which real data contains (two matches at 2026-04-25 10:00).
 */
export const importActivitySchema = z.object({
  externalRef: z.string().min(1).max(100).nullable(),
  /** Local wall time, resolved through `timeZone` on the server. */
  date: localDateSchema,
  time: localTimeSchema,
  /** As the source names it ("Träning", "Tävling", "Övrigt"). */
  typeName: z.string().min(1).max(100),
  title: z.string().max(200).nullable(),
  /**
   * Whether the source considers this activity registered. An unconfirmed
   * activity was never marked, so it yields no records at all — the rate is
   * attended ÷ marked (ADR-012), and nobody said anything here.
   */
  confirmed: z.boolean(),
  /**
   * Swedish LOK-stöd eligibility. Carried so the preview can show it and
   * never used to filter: in real data a non-eligible column is still a real
   * match, and dropping it would lose a game that was played.
   */
  lokEligible: z.boolean(),
});

export type ImportActivity = z.infer<typeof importActivitySchema>;

/**
 * One member's row. `marks` is keyed by the activity's position in the
 * `activities` array — an absent key is an unmarked cell, which is not the
 * same as an absent member and must never become a record.
 */
export const importAttendanceRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100),
  /** The source's own member id. Kept for display; never a match key. */
  externalRef: z.string().max(100).nullable(),
  /** Activity index → the cell's raw value, mapped to a status by the wizard. */
  marks: z.record(z.string(), z.string().min(1).max(50)),
});

export type ImportAttendanceRow = z.infer<typeof importAttendanceRowSchema>;

/**
 * What a cell value means, decided by the coach rather than by the file.
 * Statuses are per-team configuration (ADR-005), so no file can name them and
 * stay portable. A null status is "ignore this value".
 */
export const importStatusMappingSchema = z.object({
  value: z.string().min(1).max(50),
  statusId: z.string().nullable(),
});

/** An activity type the source names, pointed at one of the team's own. */
export const importTypeMappingSchema = z.object({
  sourceName: z.string().min(1).max(100),
  /** null = the commit creates it, with `colour`. */
  activityTypeId: z.string().nullable(),
  colour: activityColourSchema.optional(),
});

export const previewAttendanceImportInputSchema = z.object({
  teamId: z.string(),
  /** IANA zone the local times are read in, e.g. "Europe/Stockholm". */
  timeZone: z.string().min(1).max(100),
  activities: z.array(importActivitySchema).min(1).max(MAX_IMPORT_ACTIVITIES),
  rows: z.array(importAttendanceRowSchema).min(1).max(MAX_IMPORT_MEMBERS),
  statusMapping: z.array(importStatusMappingSchema).max(50),
  typeMapping: z.array(importTypeMappingSchema).max(50),
});

/** Why a row or column cannot be imported, as a code the UI translates. */
export const attendanceImportErrorSchema = z.object({
  code: z.enum([
    /** No member of this team has that name. */
    "memberNotFound",
    /** Two members share it, so picking one would be a guess. */
    "ambiguousMember",
    /** The source names a type the mapping step left unanswered. */
    "unmappedType",
    /** A cell value the mapping step left unanswered. */
    "unmappedValue",
    /** The date and time do not form a real instant in `timeZone`. */
    "invalidDateTime",
    /** Two activities in the file claim the same identity. */
    "duplicateActivity",
  ]),
  detail: z.string().nullable(),
});

export type AttendanceImportError = z.infer<typeof attendanceImportErrorSchema>;

export const attendanceActivityOutcomeSchema = z.enum([
  "create",
  "reuse",
  /** Not registered in the source; it yields no marks and is left alone. */
  "skipped",
  "error",
]);

export const attendanceActivityResultSchema = z.object({
  /** Index into the input's `activities`, so the UI can point at a column. */
  index: z.number().int(),
  date: localDateSchema,
  time: localTimeSchema,
  typeName: z.string(),
  outcome: attendanceActivityOutcomeSchema,
  /** The activity this column would write to; null when it would be created. */
  activityId: z.string().nullable(),
  errors: z.array(attendanceImportErrorSchema),
});

export type AttendanceActivityResult = z.infer<
  typeof attendanceActivityResultSchema
>;

/** One mark a commit would change, for the per-row diff. */
export const attendanceChangeSchema = z.object({
  activityIndex: z.number().int(),
  from: z.string().nullable(),
  to: z.string(),
});

export const attendanceRowResultSchema = z.object({
  rowNumber: z.number().int(),
  name: z.string(),
  memberId: z.string().nullable(),
  added: z.number().int(),
  changed: z.number().int(),
  unchanged: z.number().int(),
  /**
   * Cells before this member's first mark. Real case: a member who joined in
   * August is not absent from the spring, they were not there to be counted.
   */
  beforeJoining: z.number().int(),
  changes: z.array(attendanceChangeSchema),
  errors: z.array(attendanceImportErrorSchema),
});

export type AttendanceRowResult = z.infer<typeof attendanceRowResultSchema>;

export const attendanceImportSummarySchema = z.object({
  activitiesCreated: z.number().int(),
  activitiesReused: z.number().int(),
  activitiesSkipped: z.number().int(),
  marksAdded: z.number().int(),
  marksChanged: z.number().int(),
  marksUnchanged: z.number().int(),
  errors: z.number().int(),
});

export const previewAttendanceImportOutputSchema = z.object({
  activities: z.array(attendanceActivityResultSchema),
  rows: z.array(attendanceRowResultSchema),
  summary: attendanceImportSummarySchema,
  /** Activity type names the commit would create, in the order first seen. */
  newActivityTypes: z.array(z.string()),
});

/**
 * Committing takes exactly what the preview took and answers in the same
 * shape (#85). Aliases on purpose: a commit that accepted anything the preview
 * had not seen could not honour what the preview showed.
 */
export const commitAttendanceImportInputSchema =
  previewAttendanceImportInputSchema;
export const commitAttendanceImportOutputSchema =
  previewAttendanceImportOutputSchema;
