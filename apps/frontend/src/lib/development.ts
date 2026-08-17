/** Player development: metric definitions and dated assessments (#96). */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createDevelopmentMetricInputSchema,
  formatMetricNumber,
  isChartable,
  MAX_SCALE_SPAN,
  scaleLabelFor,
  validateMetricDefinition,
  type DevelopmentAssessment,
  type DevelopmentMetric,
  type DevelopmentValueType,
} from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { requiredText } from "./form";
import { orpcQuery } from "./orpc-query";

export { formatMetricNumber, isChartable, MAX_SCALE_SPAN, scaleLabelFor };

export const DEVELOPMENT_VALUE_TYPES: readonly DevelopmentValueType[] = [
  "scale",
  "number",
  "text",
  "boolean",
];

/**
 * The metric form. Derived from the contract's create input (ADR-007) so the
 * length rules live in one place; the cross-field rules stay in
 * `validateMetricDefinition`, which the handler runs too.
 *
 * The scale bounds and the unit are plain strings here because they come out of
 * text inputs; `metricFormToInput` is what turns them into the contract's shape.
 */
export const metricFormSchema = createDevelopmentMetricInputSchema
  .pick({ valueType: true })
  .extend({
    name: requiredText(createDevelopmentMetricInputSchema.shape.name),
    unit: createDevelopmentMetricInputSchema.shape.unit.unwrap().unwrap(),
    scaleMin: createDevelopmentMetricInputSchema.shape.scaleMin
      .unwrap()
      .unwrap(),
    scaleMax: createDevelopmentMetricInputSchema.shape.scaleMax
      .unwrap()
      .unwrap(),
    higherIsBetter: createDevelopmentMetricInputSchema.shape.higherIsBetter
      .unwrap(),
    /**
     * Free-form here rather than the contract's `min(1)`: the form holds one
     * box per step and an all-blank set legitimately means "no names".
     *
     * Entries are `nullish` because an untouched box registers as `undefined`,
     * and the dialog opens on `scale` — so switching the type to `number`
     * unmounts five boxes while react-hook-form keeps their values. Rejecting
     * those would block submit on fields that are no longer on screen, which
     * shows the user nothing at all.
     */
    scaleLabels: z
      .array(z.string().max(60).nullish().transform((value) => value ?? ""))
      .default([]),
  });

/**
 * Narrows a filled-in form to what the metric's type may actually carry, so a
 * unit typed before switching the type to "scale" is not sent along with it.
 */
export function metricFormToInput(values: {
  name: string;
  valueType: DevelopmentValueType;
  unit: string;
  scaleMin: number;
  scaleMax: number;
  scaleLabels?: string[];
  higherIsBetter: boolean;
}): {
  name: string;
  valueType: DevelopmentValueType;
  unit: string | null;
  scaleMin: number | null;
  scaleMax: number | null;
  scaleLabels: string[];
  higherIsBetter: boolean;
} {
  const isScale = values.valueType === "scale";
  const isNumber = values.valueType === "number";
  const labels = (values.scaleLabels ?? []).map((label) => label.trim());
  return {
    name: values.name,
    valueType: values.valueType,
    unit: isNumber && values.unit.trim() !== "" ? values.unit.trim() : null,
    scaleMin: isScale ? values.scaleMin : null,
    scaleMax: isScale ? values.scaleMax : null,
    // Naming the steps is all or nothing, so a form left entirely blank sends
    // none rather than a row of empty strings the handler would reject.
    scaleLabels:
      isScale && labels.some((label) => label !== "") ? labels : [],
    higherIsBetter: values.higherIsBetter,
  };
}

/** The steps of a scale paired with their names, for rendering a picker. */
export function labelledSteps(
  metric: Pick<DevelopmentMetric, "scaleMin" | "scaleMax" | "scaleLabels">,
): { step: number; label: string | null }[] {
  return scaleSteps(metric).map((step) => ({
    step,
    label: scaleLabelFor(metric, step),
  }));
}

export { validateMetricDefinition };

export function developmentMetricsQueryOptions(
  teamId: string,
  includeArchived = false,
) {
  return orpcQuery.listDevelopmentMetrics.queryOptions({
    input: { teamId, includeArchived },
  });
}

export function useDevelopmentMetrics(teamId: string, includeArchived = false) {
  return useQuery(developmentMetricsQueryOptions(teamId, includeArchived));
}

export function useMemberDevelopment(teamId: string, memberId: string) {
  return useQuery(
    orpcQuery.memberDevelopment.queryOptions({ input: { teamId, memberId } }),
  );
}

/** Everything a changed metric or assessment is visible in. */
async function invalidateDevelopment(teamId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: orpcQuery.listDevelopmentMetrics.key({ input: { teamId } }),
    }),
    queryClient.invalidateQueries({
      queryKey: orpcQuery.memberDevelopment.key({ input: { teamId } }),
    }),
  ]);
}

export function useCreateDevelopmentMetric(teamId: string) {
  return useMutation({
    mutationFn: (input: {
      name: string;
      valueType: DevelopmentValueType;
      unit: string | null;
      scaleMin: number | null;
      scaleMax: number | null;
      scaleLabels: string[];
      higherIsBetter: boolean;
    }) => orpc.createDevelopmentMetric({ teamId, ...input }),
    onSuccess: () => invalidateDevelopment(teamId),
  });
}

export function useUpdateDevelopmentMetric(teamId: string) {
  return useMutation({
    mutationFn: (input: {
      metricId: string;
      name?: string;
      unit?: string | null;
      scaleLabels?: string[];
      higherIsBetter?: boolean;
      sortOrder?: number;
    }) => orpc.updateDevelopmentMetric({ teamId, ...input }),
    onSuccess: () => invalidateDevelopment(teamId),
  });
}

export function useArchiveDevelopmentMetric(teamId: string) {
  return useMutation({
    mutationFn: (input: { metricId: string; archived: boolean }) =>
      orpc.archiveDevelopmentMetric({ teamId, ...input }),
    onSuccess: () => invalidateDevelopment(teamId),
  });
}

export function useSaveDevelopmentAssessment(teamId: string) {
  return useMutation({
    mutationFn: (input: {
      memberId: string;
      assessedOn: string;
      note: string | null;
      values: { metricId: string; value: string | null }[];
    }) => orpc.saveDevelopmentAssessment({ teamId, ...input }),
    onSuccess: () => invalidateDevelopment(teamId),
  });
}

export function useDeleteDevelopmentAssessment(teamId: string) {
  return useMutation({
    mutationFn: (input: { assessmentId: string }) =>
      orpc.deleteDevelopmentAssessment({ teamId, ...input }),
    onSuccess: () => invalidateDevelopment(teamId),
  });
}

export interface SeriesPoint {
  assessedOn: string;
  value: number;
}

/**
 * One metric's numeric history, oldest first — the order a line is drawn in,
 * which is the reverse of the order the assessments arrive in.
 *
 * Only `scale` and `number` produce a series; a note has nothing to plot.
 */
export function seriesForMetric(
  metric: Pick<DevelopmentMetric, "id" | "valueType">,
  assessments: DevelopmentAssessment[],
): SeriesPoint[] {
  if (!isChartable(metric.valueType)) return [];

  return assessments
    .flatMap((assessment) => {
      const value = assessment.values.find(
        (candidate) => candidate.metricId === metric.id,
      );
      return value?.number === null || value?.number === undefined
        ? []
        : [{ assessedOn: assessment.assessedOn, value: value.number }];
    })
    .sort((a, b) => a.assessedOn.localeCompare(b.assessedOn));
}

export interface LatestReading {
  latest: SeriesPoint;
  /** Null when there is nothing to compare against yet. */
  delta: number | null;
  /** Null when there is no delta, or when the value did not move. */
  improved: boolean | null;
}

/**
 * The newest reading and how it moved.
 *
 * `improved` is not the sign of the delta: a sprint time falling is a player
 * getting faster, which is why the metric carries `higherIsBetter` at all.
 */
export function latestAndDelta(
  series: SeriesPoint[],
  higherIsBetter: boolean,
): LatestReading | null {
  const latest = series.at(-1);
  if (!latest) return null;

  const previous = series.at(-2);
  if (!previous) return { latest, delta: null, improved: null };

  const delta = latest.value - previous.value;
  if (delta === 0) return { latest, delta, improved: null };

  return { latest, delta, improved: delta > 0 === higherIsBetter };
}

/** The drawing box the sparkline normalises into. */
const CHART_WIDTH = 100;
const CHART_HEIGHT = 32;
/** Keeps the stroke and its end caps inside the viewBox. */
const CHART_PADDING = 3;

/**
 * The `points` attribute of the sparkline's `<polyline>`.
 *
 * A `scale` normalises against its own bounds, so a 3 sits a fixed height up
 * the card whichever player is being looked at. A `number` has no bounds, so it
 * normalises against its own range — and a flat series would divide by zero, so
 * it is drawn down the middle instead.
 */
export function sparklinePoints(
  series: SeriesPoint[],
  bounds: { min: number; max: number } | null,
): { x: number; y: number }[] {
  if (series.length === 0) return [];

  const values = series.map((point) => point.value);
  const min = bounds?.min ?? Math.min(...values);
  const max = bounds?.max ?? Math.max(...values);
  const span = max - min;

  const usableHeight = CHART_HEIGHT - CHART_PADDING * 2;
  const usableWidth = CHART_WIDTH - CHART_PADDING * 2;

  return series.map((point, index) => {
    const ratio =
      series.length === 1 ? 0.5 : index / (series.length - 1);
    const height = span === 0 ? 0.5 : (point.value - min) / span;
    return {
      x: CHART_PADDING + ratio * usableWidth,
      // SVG y grows downwards; a higher value has to sit nearer the top.
      y: CHART_PADDING + (1 - height) * usableHeight,
    };
  });
}

/** The `points` string an SVG `<polyline>` takes. */
export function polylinePoints(points: { x: number; y: number }[]): string {
  return points
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
}

export const CHART_VIEW_BOX = `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`;

/** The bounds a metric's chart normalises against, or null to use its range. */
export function chartBounds(
  metric: Pick<DevelopmentMetric, "valueType" | "scaleMin" | "scaleMax">,
): { min: number; max: number } | null {
  if (
    metric.valueType === "scale" &&
    metric.scaleMin !== null &&
    metric.scaleMax !== null
  ) {
    return { min: metric.scaleMin, max: metric.scaleMax };
  }
  return null;
}

/** The steps a scale offers, so the form can render one control per step. */
export function scaleSteps(
  metric: Pick<DevelopmentMetric, "scaleMin" | "scaleMax">,
): number[] {
  if (metric.scaleMin === null || metric.scaleMax === null) return [];
  const steps: number[] = [];
  for (let value = metric.scaleMin; value <= metric.scaleMax; value += 1) {
    steps.push(value);
  }
  return steps;
}
