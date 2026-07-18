import { describe, expect, it } from "vitest";
import { validateMemberFieldValue } from "@fc-app/contracts";

describe("validateMemberFieldValue", () => {
  it("accepts any text", () => {
    expect(
      validateMemberFieldValue({ fieldType: "text", options: [] }, "  hi  ")
    ).toEqual({ ok: true, value: "  hi  " });
  });

  it("normalizes numbers and rejects non-numbers", () => {
    expect(
      validateMemberFieldValue({ fieldType: "number", options: [] }, " 07 ")
    ).toEqual({ ok: true, value: "7" });
    expect(
      validateMemberFieldValue({ fieldType: "number", options: [] }, "abc").ok
    ).toBe(false);
    expect(
      validateMemberFieldValue({ fieldType: "number", options: [] }, "").ok
    ).toBe(false);
  });

  it("accepts ISO dates and rejects other shapes", () => {
    expect(
      validateMemberFieldValue({ fieldType: "date", options: [] }, "2014-05-01")
    ).toEqual({ ok: true, value: "2014-05-01" });
    expect(
      validateMemberFieldValue({ fieldType: "date", options: [] }, "01/05/2014")
        .ok
    ).toBe(false);
    expect(
      validateMemberFieldValue({ fieldType: "date", options: [] }, "2014-13-99")
        .ok
    ).toBe(false);
  });

  it("accepts only true/false for boolean", () => {
    expect(
      validateMemberFieldValue({ fieldType: "boolean", options: [] }, "true")
    ).toEqual({ ok: true, value: "true" });
    expect(
      validateMemberFieldValue({ fieldType: "boolean", options: [] }, "yes").ok
    ).toBe(false);
  });

  it("accepts only listed options for select", () => {
    const field = { fieldType: "select" as const, options: ["GK", "DEF"] };
    expect(validateMemberFieldValue(field, "GK")).toEqual({
      ok: true,
      value: "GK",
    });
    expect(validateMemberFieldValue(field, "FWD").ok).toBe(false);
  });
});
