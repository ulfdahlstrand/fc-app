/** The dashboard's trend arithmetic (issue #20). */
import { describe, expect, it } from "vitest";
import { attendanceDelta } from "./dashboard";

describe("attendanceDelta", () => {
  it("reports the rise in percentage points", () => {
    expect(attendanceDelta({ rate: 88, previousRate: 74 })).toBe(14);
  });

  it("reports a fall as a negative number", () => {
    expect(attendanceDelta({ rate: 61, previousRate: 80 })).toBe(-19);
  });

  it("is zero when the rate held steady", () => {
    expect(attendanceDelta({ rate: 75, previousRate: 75 })).toBe(0);
  });

  it("has no trend when the previous window was never marked", () => {
    expect(attendanceDelta({ rate: 80, previousRate: null })).toBeNull();
  });

  it("has no trend when this window is not marked yet", () => {
    expect(attendanceDelta({ rate: null, previousRate: 80 })).toBeNull();
  });

  it("has no trend for a team that has never marked attendance", () => {
    expect(attendanceDelta({ rate: null, previousRate: null })).toBeNull();
  });
});
