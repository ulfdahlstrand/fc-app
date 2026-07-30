import { z } from "zod";

import { isoInstantSchema, queryBooleanSchema } from "./common.js";

// Tracking lists (issue #19, ADR-005)
//
// The configurable replacement for the spreadsheets a club keeps on the side:
// "Grönt kort", "Rabatthäfte hämtat", "Medlemsavgift betald". A team defines
// typed definitions; each member gets at most one entry per definition.
//
// Three value types, and no more, because a tracking list answers one of three
// questions: is it done, when was it done, or what was noted. Anything richer
// is a custom member field (#8), which describes the person rather than the
// club's progress in chasing them.
//
// A missing entry is **not** a "no". It is "nobody has said yet", which is what
// the matrix draws with a dashed ring and what the dashboard (#20) counts as
// outstanding. Only a `done` definition can be complete or incomplete at all —
// see `isTrackingComplete`.
// ---------------------------------------------------------------------------

export const trackingValueTypeSchema = z.enum(["done", "date", "text"]);

export type TrackingValueType = z.infer<typeof trackingValueTypeSchema>;

export const trackingDefinitionSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  valueType: trackingValueTypeSchema,
  sortOrder: z.number().int(),
  archived: z.boolean(),
});

export type TrackingDefinition = z.infer<typeof trackingDefinitionSchema>;

/** One member's answer on one definition. Absent means "not decided yet". */
export const trackingEntrySchema = z.object({
  definitionId: z.string(),
  memberId: z.string(),
  /** "true" for a done tick, "YYYY-MM-DD" for a date, free text otherwise. */
  value: z.string(),
  updatedAt: isoInstantSchema,
  /** Who last ticked it; null when that account is gone. */
  updatedBy: z.string().nullable(),
  updatedByName: z.string().nullable(),
});

export type TrackingEntry = z.infer<typeof trackingEntrySchema>;

/**
 * Validates and normalises a raw value against its definition's type, mirroring
 * `validateMemberFieldValue` (#8). Pure, shared, and tested: the matrix and the
 * API must agree on what "done" means, and a `date` typed by hand in one place
 * and picked from a control in another has to normalise to the same string.
 */
export function validateTrackingValue(
  valueType: TrackingValueType,
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  switch (valueType) {
    case "done": {
      // Only "true" is ever stored. Clearing a tick deletes the entry rather
      // than writing "false" — an untick means nobody has said, not "no".
      if (trimmed !== "true") {
        return { ok: false, error: "Expected true" };
      }
      return { ok: true, value: "true" };
    }
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return { ok: false, error: "Expected a date (YYYY-MM-DD)" };
      }
      const parsed = new Date(`${trimmed}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, error: "Not a valid date" };
      }
      return { ok: true, value: trimmed };
    }
    case "text": {
      if (trimmed === "") {
        return { ok: false, error: "Expected some text" };
      }
      return { ok: true, value: raw };
    }
  }
}

/**
 * Whether a definition counts as settled for one member.
 *
 * Only `done` definitions have a notion of completeness: a date or a note is
 * information, not a box to tick, and counting a blank "Comment" column as work
 * outstanding would make the dashboard nag forever. Shared so the dashboard's
 * count and the matrix's own rendering cannot disagree.
 */
export function isTrackingComplete(
  definition: Pick<TrackingDefinition, "valueType">,
  entry: { value: string } | undefined
): boolean {
  if (definition.valueType !== "done") return true;
  return entry?.value === "true";
}

export const listTrackingDefinitionsInputSchema = z.object({
  teamId: z.string(),
  includeArchived: queryBooleanSchema.optional(),
});

export const listTrackingDefinitionsOutputSchema = z.object({
  definitions: z.array(trackingDefinitionSchema),
});

export const createTrackingDefinitionInputSchema = z.object({
  teamId: z.string(),
  name: z.string().min(1).max(100),
  valueType: trackingValueTypeSchema,
});

export const createTrackingDefinitionOutputSchema = z.object({
  definition: trackingDefinitionSchema,
});

export const updateTrackingDefinitionInputSchema = z.object({
  teamId: z.string(),
  definitionId: z.string(),
  name: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().optional(),
});

export const updateTrackingDefinitionOutputSchema = z.object({
  definition: trackingDefinitionSchema,
});

export const archiveTrackingDefinitionInputSchema = z.object({
  teamId: z.string(),
  definitionId: z.string(),
  archived: z.boolean(),
});

export const archiveTrackingDefinitionOutputSchema = z.object({
  definition: trackingDefinitionSchema,
});

/** The matrix: one call for the columns, the rows and every filled cell. */
export const trackingMatrixInputSchema = z.object({
  teamId: z.string(),
  /** Narrow the rows to a group (#10). */
  groupId: z.string().optional(),
});

export const trackingMatrixMemberSchema = z.object({
  memberId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
});

export const trackingMatrixOutputSchema = z.object({
  definitions: z.array(trackingDefinitionSchema),
  members: z.array(trackingMatrixMemberSchema),
  /** Only the cells someone has answered. Absent means "not decided yet". */
  entries: z.array(trackingEntrySchema),
});

/**
 * Sets or clears one cell. One cell at a time because that is how the matrix is
 * used — a tick at a time, at the pitch side — and a whole-row save would make
 * two coaches editing different columns overwrite each other.
 */
export const setTrackingEntryInputSchema = z.object({
  teamId: z.string(),
  definitionId: z.string(),
  memberId: z.string(),
  /** null clears the cell back to "not decided yet". */
  value: z.string().max(500).nullable(),
});

export const setTrackingEntryOutputSchema = z.object({
  /** null when the cell was cleared. */
  entry: trackingEntrySchema.nullable(),
});

/** A member's own tracking status, for the member detail page (#7). */
export const memberTrackingInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
});

export const memberTrackingOutputSchema = z.object({
  definitions: z.array(trackingDefinitionSchema),
  entries: z.array(trackingEntrySchema),
});

// ---------------------------------------------------------------------------
