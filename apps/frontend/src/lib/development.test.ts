/** Development series, deltas and the sparkline's geometry (#96). */
import { describe, expect, it } from "vitest";
import type { DevelopmentAssessment } from "@fc-app/contracts";
import {
  chartBounds,
  latestAndDelta,
  metricFormToInput,
  scaleSteps,
  seriesForMetric,
  sparklinePoints,
  type SeriesPoint,
} from "./development";

const scale = {
  id: "niva",
  valueType: "scale" as const,
  scaleMin: 1,
  scaleMax: 5,
};

function assessment(
  assessedOn: string,
  values: { metricId: string; number: number | null; text: string | null }[],
): DevelopmentAssessment {
  return {
    id: `a-${assessedOn}`,
    memberId: "m1",
    assessedOn,
    note: null,
    createdBy: "u1",
    createdByName: "Karin Tränare",
    createdAt: "2026-03-01T10:00:00.000Z",
    values,
  };
}

describe("seriesForMetric", () => {
  it("orders oldest first, whatever order the assessments arrive in", () => {
    const series = seriesForMetric(scale, [
      assessment("2026-05-01", [{ metricId: "niva", number: 4, text: null }]),
      assessment("2026-03-01", [{ metricId: "niva", number: 2, text: null }]),
      assessment("2026-04-01", [{ metricId: "niva", number: 3, text: null }]),
    ]);
    expect(series.map((point) => point.value)).toEqual([2, 3, 4]);
  });

  it("skips assessments where the metric was not measured", () => {
    const series = seriesForMetric(scale, [
      assessment("2026-03-01", [{ metricId: "niva", number: 2, text: null }]),
      assessment("2026-04-01", []),
    ]);
    expect(series).toHaveLength(1);
  });

  it("ignores other metrics' values", () => {
    const series = seriesForMetric(scale, [
      assessment("2026-03-01", [{ metricId: "sprint", number: 4.6, text: null }]),
    ]);
    expect(series).toEqual([]);
  });

  it("has no series for a metric that cannot be charted", () => {
    const note = {
      id: "kommentar",
      valueType: "text" as const,
      scaleMin: null,
      scaleMax: null,
    };
    const series = seriesForMetric(note, [
      assessment("2026-03-01", [
        { metricId: "kommentar", number: null, text: "Stark vänsterfot" },
      ]),
    ]);
    expect(series).toEqual([]);
  });
});

describe("latestAndDelta", () => {
  const series: SeriesPoint[] = [
    { assessedOn: "2026-03-01", value: 2 },
    { assessedOn: "2026-04-01", value: 3 },
  ];

  it("returns nothing for an empty series", () => {
    expect(latestAndDelta([], true)).toBeNull();
  });

  it("has no delta from a single reading", () => {
    expect(latestAndDelta([series[0]!], true)).toEqual({
      latest: series[0],
      delta: null,
      improved: null,
    });
  });

  it("reads a rise as progress when higher is better", () => {
    expect(latestAndDelta(series, true)).toMatchObject({
      delta: 1,
      improved: true,
    });
  });

  it("reads the same rise as a setback when lower is better", () => {
    expect(latestAndDelta(series, false)).toMatchObject({
      delta: 1,
      improved: false,
    });
  });

  it("reads a falling sprint time as progress", () => {
    const sprint: SeriesPoint[] = [
      { assessedOn: "2026-03-01", value: 4.8 },
      { assessedOn: "2026-04-01", value: 4.6 },
    ];
    expect(latestAndDelta(sprint, false)?.improved).toBe(true);
  });

  it("calls an unchanged value neither progress nor setback", () => {
    const flat: SeriesPoint[] = [
      { assessedOn: "2026-03-01", value: 3 },
      { assessedOn: "2026-04-01", value: 3 },
    ];
    expect(latestAndDelta(flat, true)).toMatchObject({
      delta: 0,
      improved: null,
    });
  });
});

describe("sparklinePoints", () => {
  const series: SeriesPoint[] = [
    { assessedOn: "2026-03-01", value: 1 },
    { assessedOn: "2026-04-01", value: 5 },
  ];

  it("puts a higher value nearer the top, since SVG y grows downwards", () => {
    const [low, high] = sparklinePoints(series, { min: 1, max: 5 });
    expect(high!.y).toBeLessThan(low!.y);
  });

  it("spans the full width from first reading to last", () => {
    const points = sparklinePoints(series, { min: 1, max: 5 });
    expect(points[0]!.x).toBeLessThan(points.at(-1)!.x);
  });

  it("normalises a scale against its own bounds, not the readings", () => {
    // A 3 on a 1–5 scale sits mid-height whether or not a 1 or a 5 was ever
    // recorded — otherwise the same value would jump around between players.
    const mid = sparklinePoints(
      [{ assessedOn: "2026-03-01", value: 3 }],
      { min: 1, max: 5 },
    );
    const alone = sparklinePoints(
      [{ assessedOn: "2026-03-01", value: 3 }],
      null,
    );
    expect(mid[0]!.y).toBe(alone[0]!.y);
  });

  it("draws a flat series down the middle rather than dividing by zero", () => {
    const flat = sparklinePoints(
      [
        { assessedOn: "2026-03-01", value: 4.6 },
        { assessedOn: "2026-04-01", value: 4.6 },
      ],
      null,
    );
    expect(flat.every((point) => Number.isFinite(point.y))).toBe(true);
    expect(flat[0]!.y).toBe(flat[1]!.y);
  });

  it("has nothing to draw for an empty series", () => {
    expect(sparklinePoints([], null)).toEqual([]);
  });
});

describe("chartBounds", () => {
  it("uses a scale's own range", () => {
    expect(chartBounds(scale)).toEqual({ min: 1, max: 5 });
  });

  it("leaves a free number to its own readings", () => {
    expect(
      chartBounds({ valueType: "number", scaleMin: null, scaleMax: null }),
    ).toBeNull();
  });
});

describe("scaleSteps", () => {
  it("lists every step, both ends included", () => {
    expect(scaleSteps({ scaleMin: 1, scaleMax: 5 })).toEqual([1, 2, 3, 4, 5]);
  });

  it("has no steps without a range", () => {
    expect(scaleSteps({ scaleMin: null, scaleMax: null })).toEqual([]);
  });
});

describe("metricFormToInput", () => {
  const base = {
    name: "Nivå",
    unit: "s",
    scaleMin: 1,
    scaleMax: 5,
    higherIsBetter: true,
  };

  it("drops the unit a scale may not carry", () => {
    expect(metricFormToInput({ ...base, valueType: "scale" })).toMatchObject({
      unit: null,
      scaleMin: 1,
      scaleMax: 5,
    });
  });

  it("drops the range a number may not carry", () => {
    expect(metricFormToInput({ ...base, valueType: "number" })).toMatchObject({
      unit: "s",
      scaleMin: null,
      scaleMax: null,
    });
  });

  it("leaves text and boolean with neither", () => {
    expect(metricFormToInput({ ...base, valueType: "text" })).toMatchObject({
      unit: null,
      scaleMin: null,
      scaleMax: null,
    });
  });

  it("treats a blank unit as no unit", () => {
    expect(
      metricFormToInput({ ...base, unit: "   ", valueType: "number" }).unit,
    ).toBeNull();
  });
});
