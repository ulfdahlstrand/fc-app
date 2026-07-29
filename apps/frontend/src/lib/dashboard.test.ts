/**
 * The dashboard's trend arithmetic (issue #20).
 *
 * The widget's whole job is to say whether attendance is going up or down, so
 * the case that matters most is the one where it must refuse to say anything:
 * a team with no history to compare against has no trend, and inventing one
 * would be the first number on the page that is not true.
 */
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
