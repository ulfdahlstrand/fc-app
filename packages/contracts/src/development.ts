/**
 * Player development: what a team measures, and those measurements over time.
 *
 * The first time series in the model. Custom member fields (#8) and tracking
 * lists (#19) both keep exactly one current value per member per definition and
 * overwrite it; here the whole point is the history, so values hang off a dated
 * **assessment** rather than off the member directly (ADR-005, ADR-014).
 */

import { z } from "zod";
import { isoInstantSchema, queryBooleanSchema } from "./common.js";

export const developmentValueTypeSchema = z.enum([
  "scale",
  "number",
  "text",
  "boolean",
]);

export type DevelopmentValueType = z.infer<typeof developmentValueTypeSchema>;

export const developmentMetricSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  valueType: developmentValueTypeSchema,
  /** Display-only suffix for a `number` metric ("s", "m", "cm"); null otherwise. */
  unit: z.string().nullable(),
  /** Inclusive bounds of a `scale` metric; null for every other type. */
  scaleMin: z.number().int().nullable(),
  scaleMax: z.number().int().nullable(),
  /**
   * Whether a rise counts as progress. A sprint time falls when a player gets
   * better, so the arrow cannot be read off the sign of the change alone.
   */
  higherIsBetter: z.boolean(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
});

export type DevelopmentMetric = z.infer<typeof developmentMetricSchema>;

/**
 * One metric at one assessment. Exactly one of `number`/`text` is set — which
 * one is decided by the metric's type, never by the caller (`metricValueColumn`).
 * A metric with no value at an assessment has no entry at all: it was not
 * measured that day, which is not the same as measuring zero (DDR-006).
 */
export const developmentValueSchema = z.object({
  metricId: z.string(),
  number: z.number().nullable(),
  text: z.string().nullable(),
});

export type DevelopmentValue = z.infer<typeof developmentValueSchema>;

/** One occasion: a member, a day, and everything recorded about them on it. */
export const developmentAssessmentSchema = z.object({
  id: z.string(),
  memberId: z.string(),
  /** `YYYY-MM-DD` — an assessment belongs to a day, not to an instant. */
  assessedOn: z.string(),
  note: z.string().nullable(),
  /** Who recorded it; null when that account is gone. */
  createdBy: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: isoInstantSchema,
  values: z.array(developmentValueSchema),
});

export type DevelopmentAssessment = z.infer<
  typeof developmentAssessmentSchema
>;

/** Widest scale a team may define, so the form can render one control per step. */
export const MAX_SCALE_SPAN = 20;

/**
 * Which storage column a type lives in. The single place that knows, so the
 * migration's `CHECK`, the handler's insert and the chart's reader cannot
 * disagree about where a value went.
 */
export function metricValueColumn(
  valueType: DevelopmentValueType
): "number" | "text" {
  switch (valueType) {
    case "scale":
    case "number":
      return "number";
    case "text":
    case "boolean":
      return "text";
  }
}

/** Whether a type can be plotted over time at all. */
export function isChartable(valueType: DevelopmentValueType): boolean {
  return metricValueColumn(valueType) === "number";
}

/**
 * Validates and normalises one raw value against its metric, mirroring
 * `validateTrackingValue` (#19) and `validateMemberFieldValue` (#8) in shape.
 *
 * Pure, shared and tested: the dialog and the handler must agree on what "4,6"
 * means, and a scale bound enforced in one place and not the other would let a
 * 7 land on a 1–5 metric.
 *
 * An empty value is *not* handled here — the caller sends `null` for "not
 * measured", which deletes the row rather than storing a falsy value (ADR-014).
 */
export function validateDevelopmentValue(
  metric: Pick<DevelopmentMetric, "valueType" | "scaleMin" | "scaleMax">,
  raw: string
): { ok: true; number: number | null; text: string | null } | {
  ok: false;
  error: string;
} {
  const trimmed = raw.trim();
  switch (metric.valueType) {
    case "scale": {
      const parsed = Number(trimmed);
      if (trimmed === "" || !Number.isInteger(parsed)) {
        return { ok: false, error: "Expected a whole number" };
      }
      const min = metric.scaleMin;
      const max = metric.scaleMax;
      if (min === null || max === null) {
        return { ok: false, error: "This scale has no range" };
      }
      if (parsed < min || parsed > max) {
        return { ok: false, error: `Expected a number between ${min} and ${max}` };
      }
      return { ok: true, number: parsed, text: null };
    }
    case "number": {
      // A Swedish keyboard types a decimal comma; the same measurement must not
      // be rejected for it.
      const parsed = Number(trimmed.replace(",", "."));
      if (trimmed === "" || !Number.isFinite(parsed)) {
        return { ok: false, error: "Not a valid number" };
      }
      return { ok: true, number: parsed, text: null };
    }
    case "boolean": {
      if (trimmed !== "true" && trimmed !== "false") {
        return { ok: false, error: "Expected true or false" };
      }
      return { ok: true, number: null, text: trimmed };
    }
    case "text": {
      if (trimmed === "") {
        return { ok: false, error: "Expected some text" };
      }
      return { ok: true, number: null, text: raw };
    }
  }
}

/**
 * Validates the shape of a metric definition: which of `unit`, `scaleMin` and
 * `scaleMax` a type is allowed to carry. Kept out of the Zod schema because the
 * rule is cross-field, and shared so the settings dialog refuses the same
 * combinations the handler does.
 */
export function validateMetricDefinition(input: {
  valueType: DevelopmentValueType;
  unit?: string | null | undefined;
  scaleMin?: number | null | undefined;
  scaleMax?: number | null | undefined;
}): { ok: true } | { ok: false; error: string } {
  const hasUnit = input.unit !== null && input.unit !== undefined && input.unit !== "";
  const min = input.scaleMin ?? null;
  const max = input.scaleMax ?? null;

  if (input.valueType !== "scale" && (min !== null || max !== null)) {
    return { ok: false, error: "Only a scale has a range" };
  }
  if (input.valueType !== "number" && hasUnit) {
    return { ok: false, error: "Only a number has a unit" };
  }

  if (input.valueType === "scale") {
    if (min === null || max === null) {
      return { ok: false, error: "A scale needs a lowest and a highest value" };
    }
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      return { ok: false, error: "A scale's range must be whole numbers" };
    }
    if (min >= max) {
      return {
        ok: false,
        error: "The highest value must be above the lowest one",
      };
    }
    if (max - min > MAX_SCALE_SPAN) {
      return {
        ok: false,
        error: `A scale may span at most ${MAX_SCALE_SPAN} steps`,
      };
    }
  }

  return { ok: true };
}

/** A stored number with its metric's unit appended — "4.6 s", or "3" for a scale. */
export function formatMetricNumber(
  metric: Pick<DevelopmentMetric, "unit">,
  value: number
): string {
  return metric.unit ? `${value} ${metric.unit}` : String(value);
}

// Metric definitions

export const listDevelopmentMetricsInputSchema = z.object({
  teamId: z.string(),
  includeArchived: queryBooleanSchema.optional(),
});

export const listDevelopmentMetricsOutputSchema = z.object({
  metrics: z.array(developmentMetricSchema),
});

export const createDevelopmentMetricInputSchema = z.object({
  teamId: z.string(),
  name: z.string().min(1).max(100),
  valueType: developmentValueTypeSchema,
  unit: z.string().max(20).nullable().optional(),
  scaleMin: z.number().int().min(-1000).max(1000).nullable().optional(),
  scaleMax: z.number().int().min(-1000).max(1000).nullable().optional(),
  higherIsBetter: z.boolean().optional(),
});

export const createDevelopmentMetricOutputSchema = z.object({
  metric: developmentMetricSchema,
});

/**
 * `valueType` and the scale bounds are absent on purpose: narrowing a 1–10
 * scale to 1–5 would leave stored 8s outside their own metric, and flipping a
 * type would leave every stored value meaning nothing (ADR-014). Archive it and
 * make a new one instead.
 */
export const updateDevelopmentMetricInputSchema = z.object({
  teamId: z.string(),
  metricId: z.string(),
  name: z.string().min(1).max(100).optional(),
  unit: z.string().max(20).nullable().optional(),
  higherIsBetter: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateDevelopmentMetricOutputSchema = z.object({
  metric: developmentMetricSchema,
});

export const archiveDevelopmentMetricInputSchema = z.object({
  teamId: z.string(),
  metricId: z.string(),
  archived: z.boolean(),
});

export const archiveDevelopmentMetricOutputSchema = z.object({
  metric: developmentMetricSchema,
});

// Assessments

/** One member's whole history, for the section on their detail page. */
export const memberDevelopmentInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
});

export const memberDevelopmentOutputSchema = z.object({
  /** Includes archived metrics, so an old assessment can still label itself. */
  metrics: z.array(developmentMetricSchema),
  /** Newest first. */
  assessments: z.array(developmentAssessmentSchema),
});

/** A raw value as typed; `null` means "not measured", and clears any stored row. */
export const developmentValueInputSchema = z.object({
  metricId: z.string(),
  value: z.string().max(1000).nullable(),
});

/**
 * The whole occasion in one write (ADR-019). This is the attendance case, not
 * the tracking-matrix case: a coach fills a form in and saves once, rather than
 * firing a request per field.
 *
 * `assessedOn` is the key — saving the same member and day again updates that
 * assessment instead of creating a second one.
 */
export const saveDevelopmentAssessmentInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
  assessedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(2000).nullable().optional(),
  values: z.array(developmentValueInputSchema),
});

export const saveDevelopmentAssessmentOutputSchema = z.object({
  assessment: developmentAssessmentSchema,
});

export const deleteDevelopmentAssessmentInputSchema = z.object({
  teamId: z.string(),
  assessmentId: z.string(),
});

export const deleteDevelopmentAssessmentOutputSchema = z.object({
  deleted: z.boolean(),
});
