/** Tracking list values and completeness (issue #19). */
import { describe, expect, it } from "vitest";
import { isTrackingComplete, validateTrackingValue } from "@fc-app/contracts";

describe("validateTrackingValue", () => {
  it("stores only true for a done tick", () => {
    expect(validateTrackingValue("done", "true")).toEqual({
      ok: true,
      value: "true",
    });
  });

  it("refuses false for a done tick — clearing deletes the entry instead", () => {
    expect(validateTrackingValue("done", "false").ok).toBe(false);
  });

  it("accepts ISO dates and rejects other shapes", () => {
    expect(validateTrackingValue("date", " 2026-08-01 ")).toEqual({
      ok: true,
      value: "2026-08-01",
    });
    expect(validateTrackingValue("date", "01/08/2026").ok).toBe(false);
    expect(validateTrackingValue("date", "2026-13-99").ok).toBe(false);
  });

  it("keeps text as typed but refuses blank", () => {
    expect(validateTrackingValue("text", "  Betalt via Swish ")).toEqual({
      ok: true,
      value: "  Betalt via Swish ",
    });
    expect(validateTrackingValue("text", "   ").ok).toBe(false);
  });
});

describe("isTrackingComplete", () => {
  const done = { valueType: "done" as const };

  it("is complete when the box is ticked", () => {
    expect(isTrackingComplete(done, { value: "true" })).toBe(true);
  });

  it("is outstanding when there is no entry at all", () => {
    expect(isTrackingComplete(done, undefined)).toBe(false);
  });

  it("treats date and text definitions as never outstanding", () => {
    expect(isTrackingComplete({ valueType: "date" }, undefined)).toBe(true);
    expect(isTrackingComplete({ valueType: "text" }, undefined)).toBe(true);
  });
});
