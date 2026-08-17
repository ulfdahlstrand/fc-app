/** Development metric values and definition shapes. */
import { describe, expect, it } from "vitest";
import {
  formatMetricNumber,
  isChartable,
  MAX_SCALE_SPAN,
  metricValueColumn,
  scaleLabelFor,
  validateDevelopmentValue,
  validateMetricDefinition,
} from "@fc-app/contracts";

const DIFFICULTY = ["Extra lätt", "Lätt", "Medel", "Svår", "Extra svår"];

const scale = { valueType: "scale" as const, scaleMin: 1, scaleMax: 5 };
const number = { valueType: "number" as const, scaleMin: null, scaleMax: null };
const text = { valueType: "text" as const, scaleMin: null, scaleMax: null };
const boolean = { valueType: "boolean" as const, scaleMin: null, scaleMax: null };

describe("metricValueColumn", () => {
  // Exhaustive on purpose: a fifth value type should break this test rather
  // than the CHECK constraint in production.
  it("routes each type to exactly one column", () => {
    expect(metricValueColumn("scale")).toBe("number");
    expect(metricValueColumn("number")).toBe("number");
    expect(metricValueColumn("text")).toBe("text");
    expect(metricValueColumn("boolean")).toBe("text");
  });

  it("charts only what is numeric", () => {
    expect(isChartable("scale")).toBe(true);
    expect(isChartable("number")).toBe(true);
    expect(isChartable("text")).toBe(false);
    expect(isChartable("boolean")).toBe(false);
  });
});

describe("validateDevelopmentValue", () => {
  it("accepts a whole number inside the scale", () => {
    expect(validateDevelopmentValue(scale, " 3 ")).toEqual({
      ok: true,
      number: 3,
      text: null,
    });
  });

  it("refuses a scale value outside its own range", () => {
    expect(validateDevelopmentValue(scale, "0").ok).toBe(false);
    expect(validateDevelopmentValue(scale, "6").ok).toBe(false);
  });

  it("names the range it expected, so the message is actionable", () => {
    const result = validateDevelopmentValue(scale, "9");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("between 1 and 5");
  });

  it("refuses a fraction on a scale", () => {
    expect(validateDevelopmentValue(scale, "3.5").ok).toBe(false);
  });

  it("reads a decimal comma the same as a decimal point", () => {
    expect(validateDevelopmentValue(number, "4,6")).toEqual({
      ok: true,
      number: 4.6,
      text: null,
    });
    expect(validateDevelopmentValue(number, "4.6")).toEqual({
      ok: true,
      number: 4.6,
      text: null,
    });
  });

  it("refuses a number that is not one", () => {
    expect(validateDevelopmentValue(number, "").ok).toBe(false);
    expect(validateDevelopmentValue(number, "snabb").ok).toBe(false);
  });

  it("stores a boolean as text and refuses anything else", () => {
    expect(validateDevelopmentValue(boolean, "true")).toEqual({
      ok: true,
      number: null,
      text: "true",
    });
    expect(validateDevelopmentValue(boolean, "false")).toEqual({
      ok: true,
      number: null,
      text: "false",
    });
    expect(validateDevelopmentValue(boolean, "ja").ok).toBe(false);
  });

  it("keeps text as typed but refuses blank", () => {
    expect(validateDevelopmentValue(text, "  Stark vänsterfot ")).toEqual({
      ok: true,
      number: null,
      text: "  Stark vänsterfot ",
    });
    expect(validateDevelopmentValue(text, "   ").ok).toBe(false);
  });

  it("refuses a scale metric that lost its range", () => {
    expect(
      validateDevelopmentValue(
        { valueType: "scale", scaleMin: null, scaleMax: null },
        "3"
      ).ok
    ).toBe(false);
  });
});

describe("validateMetricDefinition", () => {
  it("accepts a well-formed scale", () => {
    expect(
      validateMetricDefinition({ valueType: "scale", scaleMin: 1, scaleMax: 5 })
    ).toEqual({ ok: true });
  });

  it("requires both ends of a scale", () => {
    expect(
      validateMetricDefinition({ valueType: "scale", scaleMin: 1 }).ok
    ).toBe(false);
  });

  it("refuses an inverted or empty range", () => {
    expect(
      validateMetricDefinition({ valueType: "scale", scaleMin: 5, scaleMax: 1 })
        .ok
    ).toBe(false);
    expect(
      validateMetricDefinition({ valueType: "scale", scaleMin: 3, scaleMax: 3 })
        .ok
    ).toBe(false);
  });

  it("caps how wide a scale may be, so the form stays renderable", () => {
    expect(
      validateMetricDefinition({
        valueType: "scale",
        scaleMin: 0,
        scaleMax: MAX_SCALE_SPAN,
      }).ok
    ).toBe(true);
    expect(
      validateMetricDefinition({
        valueType: "scale",
        scaleMin: 0,
        scaleMax: MAX_SCALE_SPAN + 1,
      }).ok
    ).toBe(false);
  });

  it("gives a unit only to a number", () => {
    expect(validateMetricDefinition({ valueType: "number", unit: "s" })).toEqual(
      { ok: true }
    );
    expect(
      validateMetricDefinition({
        valueType: "scale",
        scaleMin: 1,
        scaleMax: 5,
        unit: "s",
      }).ok
    ).toBe(false);
  });

  it("gives a range only to a scale", () => {
    expect(
      validateMetricDefinition({ valueType: "number", scaleMin: 1, scaleMax: 5 })
        .ok
    ).toBe(false);
  });

  it("lets text and boolean carry neither", () => {
    expect(validateMetricDefinition({ valueType: "text" })).toEqual({ ok: true });
    expect(validateMetricDefinition({ valueType: "boolean" })).toEqual({
      ok: true,
    });
  });
});

describe("named scale steps", () => {
  it("accepts exactly one name per step", () => {
    expect(
      validateMetricDefinition({
        valueType: "scale",
        scaleMin: 1,
        scaleMax: 5,
        scaleLabels: DIFFICULTY,
      })
    ).toEqual({ ok: true });
  });

  it("refuses a partly named scale, saying how many it wanted", () => {
    const result = validateMetricDefinition({
      valueType: "scale",
      scaleMin: 1,
      scaleMax: 5,
      scaleLabels: ["Lätt", "Svår"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("expected 5 names, got 2");
  });

  it("refuses a blank name among named steps", () => {
    expect(
      validateMetricDefinition({
        valueType: "scale",
        scaleMin: 1,
        scaleMax: 5,
        scaleLabels: ["Extra lätt", "Lätt", "   ", "Svår", "Extra svår"],
      }).ok
    ).toBe(false);
  });

  it("still allows a scale of bare numbers", () => {
    expect(
      validateMetricDefinition({
        valueType: "scale",
        scaleMin: 1,
        scaleMax: 5,
        scaleLabels: [],
      })
    ).toEqual({ ok: true });
  });

  it("gives named steps only to a scale", () => {
    expect(
      validateMetricDefinition({
        valueType: "number",
        scaleLabels: ["Lätt"],
      }).ok
    ).toBe(false);
  });

  it("counts steps from the scale's own floor, not from one", () => {
    expect(
      validateMetricDefinition({
        valueType: "scale",
        scaleMin: 0,
        scaleMax: 2,
        scaleLabels: ["Noll", "Ett", "Två"],
      })
    ).toEqual({ ok: true });
  });
});

describe("scaleLabelFor", () => {
  const metric = { scaleMin: 1, scaleLabels: DIFFICULTY };

  it("names each step, both ends included", () => {
    expect(scaleLabelFor(metric, 1)).toBe("Extra lätt");
    expect(scaleLabelFor(metric, 3)).toBe("Medel");
    expect(scaleLabelFor(metric, 5)).toBe("Extra svår");
  });

  it("offsets by the scale's floor rather than assuming it starts at one", () => {
    expect(scaleLabelFor({ scaleMin: 0, scaleLabels: ["Noll", "Ett"] }, 0)).toBe(
      "Noll"
    );
  });

  it("has no name when the steps are bare numbers", () => {
    expect(scaleLabelFor({ scaleMin: 1, scaleLabels: [] }, 3)).toBeNull();
  });

  it("returns null out of range rather than throwing", () => {
    expect(scaleLabelFor(metric, 9)).toBeNull();
    expect(scaleLabelFor(metric, 0)).toBeNull();
  });
});

describe("formatMetricNumber", () => {
  it("appends a unit when there is one", () => {
    expect(formatMetricNumber({ unit: "s" }, 4.6)).toBe("4.6 s");
    expect(formatMetricNumber({ unit: null }, 3)).toBe("3");
  });
});
