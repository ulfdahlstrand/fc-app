/**
 * Grouping "my call-ups" (issue #17).
 *
 * A guardian with two children in the same squad is asked twice, and the two
 * questions must land in one card as two rows — not as the same match listed
 * twice, which reads like a bug.
 */
import { describe, expect, it } from "vitest";
import type { MyCallup } from "@fc-app/contracts";
import { groupByActivity } from "./callup-responses";

function callup(activityId: string, memberName: string): MyCallup {
  return {
    teamId: "team",
    teamName: "P14",
    activityId,
    startsAt: "2026-08-01T15:30:00.000Z",
    endsAt: null,
    title: "vs. Skiljebo SK",
    activityTypeId: "type",
    location: "Vallby IP 2",
    callupNote: null,
    memberId: memberName,
    memberName,
    response: "pending",
    responseNote: null,
    respondedBy: null,
  };
}

describe("groupByActivity", () => {
  it("puts two children at the same match in one group", () => {
    const groups = groupByActivity([
      callup("a1", "Alva"),
      callup("a1", "Otto"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries.map((one) => one.memberName)).toEqual([
      "Alva",
      "Otto",
    ]);
  });

  it("keeps separate activities apart", () => {
    const groups = groupByActivity([
      callup("a1", "Alva"),
      callup("a2", "Alva"),
    ]);

    expect(groups.map((group) => group.activityId)).toEqual(["a1", "a2"]);
  });

  it("preserves the order the API returned", () => {
    // The API sorts by start time; grouping must not reshuffle that.
    const groups = groupByActivity([
      callup("a2", "Alva"),
      callup("a1", "Otto"),
      callup("a1", "Alva"),
    ]);

    expect(groups.map((group) => group.activityId)).toEqual(["a2", "a1"]);
    expect(groups[1]?.entries).toHaveLength(2);
  });

  it("returns nothing for nobody", () => {
    expect(groupByActivity([])).toEqual([]);
  });
});
