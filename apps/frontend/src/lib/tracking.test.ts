/** Tracking list progress (issue #19). */
import { describe, expect, it } from "vitest";
import type { TrackingEntry } from "@fc-app/contracts";
import { cellKey, definitionProgress, entriesByCell } from "./tracking";

function entry(definitionId: string, memberId: string, value: string): TrackingEntry {
  return {
    definitionId,
    memberId,
    value,
    updatedAt: "2026-07-30T10:00:00.000Z",
    updatedBy: "u1",
    updatedByName: "Dev User",
  };
}

const members = ["alva", "otto", "maja"];

describe("entriesByCell", () => {
  it("indexes by definition and member together", () => {
    const byCell = entriesByCell([entry("kort", "alva", "true")]);
    expect(byCell.get(cellKey("kort", "alva"))?.value).toBe("true");
    expect(byCell.get(cellKey("kort", "otto"))).toBeUndefined();
  });
});

describe("definitionProgress", () => {
  const done = { id: "kort", valueType: "done" as const };

  it("counts only ticked members", () => {
    const byCell = entriesByCell([
      entry("kort", "alva", "true"),
      entry("kort", "otto", "true"),
    ]);
    expect(definitionProgress(done, members, byCell)).toEqual({
      done: 2,
      total: 3,
    });
  });

  it("treats a member with no entry as outstanding", () => {
    expect(definitionProgress(done, members, new Map())).toEqual({
      done: 0,
      total: 3,
    });
  });

  it("ignores entries belonging to another definition", () => {
    const byCell = entriesByCell([entry("annat", "alva", "true")]);
    expect(definitionProgress(done, members, byCell)).toEqual({
      done: 0,
      total: 3,
    });
  });

  it("has no progress for date or text lists", () => {
    expect(
      definitionProgress({ id: "d", valueType: "date" }, members, new Map()),
    ).toBeNull();
    expect(
      definitionProgress({ id: "t", valueType: "text" }, members, new Map()),
    ).toBeNull();
  });

  it("is complete for an empty roster rather than dividing by zero", () => {
    expect(definitionProgress(done, [], new Map())).toEqual({
      done: 0,
      total: 0,
    });
  });
});
