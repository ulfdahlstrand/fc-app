/** The tap-cycle and diff logic behind attendance registration (issue #14). */
import { describe, expect, it } from "vitest";
import type { AttendanceStatus } from "@fc-app/contracts";
import { changedEntries, nextMark, statusGlyph } from "./attendance";

function status(
  id: string,
  name: string,
  colour: AttendanceStatus["colour"],
  countsAsPresent = false,
): AttendanceStatus {
  return {
    id,
    teamId: "team",
    name,
    colour,
    countsAsPresent,
    sortOrder: 0,
    archived: false,
  };
}

const present = status("s1", "Present", "green", true);
const absent = status("s2", "Absent", "orange");
const ill = status("s3", "Ill", "amber");
const cycle = [present, absent, ill];

describe("nextMark", () => {
  it("cycles unmarked → each status in order → unmarked", () => {
    expect(nextMark(null, cycle)).toBe("s1");
    expect(nextMark("s1", cycle)).toBe("s2");
    expect(nextMark("s2", cycle)).toBe("s3");
    expect(nextMark("s3", cycle)).toBeNull();
  });

  it("starts over from a status that has since been archived", () => {
    // The record keeps rendering, but a retired status is not in the cycle,
    // so tapping it must not dead-end.
    expect(nextMark("retired", cycle)).toBe("s1");
  });

  it("stays unmarked when the team has no statuses left", () => {
    expect(nextMark(null, [])).toBeNull();
  });
});

describe("changedEntries", () => {
  it("sends only what the coach actually changed", () => {
    const saved = { a: "s1", b: "s2" };
    const marks = { a: "s1", b: "s3", c: "s1" };

    expect(changedEntries(marks, saved)).toEqual([
      { memberId: "b", statusId: "s3" },
      { memberId: "c", statusId: "s1" },
    ]);
  });

  it("sends a null to clear a mark rather than omitting the member", () => {
    // Omitting would leave the old record standing; null is what deletes it.
    expect(changedEntries({ a: null }, { a: "s1" })).toEqual([
      { memberId: "a", statusId: null },
    ]);
  });

  it("sends nothing when nothing moved", () => {
    expect(changedEntries({ a: "s1" }, { a: "s1" })).toEqual([]);
  });
});

describe("statusGlyph", () => {
  it("uses Kit's own alphabet — ✓ for green, ✕ for orange, else an initial", () => {
    expect(statusGlyph(present)).toBe("✓");
    expect(statusGlyph(absent)).toBe("✕");
    expect(statusGlyph(ill)).toBe("I");
    expect(statusGlyph(status("s4", "late", "amber"))).toBe("L");
  });
});
