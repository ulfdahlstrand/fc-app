/** Configurable checklists per member. A missing entry means "not decided yet" (ADR-014, DDR-006). */

import { z } from "zod";
import { isoInstantSchema, queryBooleanSchema } from "./common.js";

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

/** Whether a definition counts as settled for one member. */
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

/** Sets or clears one cell. */
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

