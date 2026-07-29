/**
 * Attendance arithmetic (issue #15). The acceptance criterion is that the
 * percentage matches what a coach works out by hand, so these check the
 * counting against numbers that are easy to verify on paper.
 */
import { describe, expect, it } from "vitest";
import { rateOf, summariseAttendance } from "./summarise.js";

const alva = { id: "m1", first_name: "Alva", last_name: "Bergström" };
const hugo = { id: "m2", first_name: "Hugo", last_name: "Lindqvist" };
const otto = { id: "m3", first_name: "Otto", last_name: "Persson" };

const PRESENT = new Set(["present"]);

/** n records for a member: `attended` present, the rest absent. */
function records(memberId: string, attended: number, absent: number) {
  return [
    ...Array.from({ length: attended }, () => ({
      member_id: memberId,
      status_id: "present",
    })),
    ...Array.from({ length: absent }, () => ({
      member_id: memberId,
      status_id: "absent",
    })),
  ];
}

describe("rateOf", () => {
  it("rounds to whole percent", () => {
    expect(rateOf(15, 16)).toBe(94); // 93.75
    expect(rateOf(2, 3)).toBe(67); // 66.66…
    expect(rateOf(16, 16)).toBe(100);
    expect(rateOf(0, 4)).toBe(0);
  });

  it("has no rate to state when nothing is marked", () => {
    expect(rateOf(0, 0)).toBeNull();
  });
});

describe("summariseAttendance", () => {
  it("counts attended over marked, not over activities held", () => {
    // 20 trainings were held but Alva was only ever marked at 16 of them.
    // Her rate is 15/16, not 15/20 — the four unmarked ones are unknown.
    const result = summariseAttendance({
      members: [alva],
      records: records("m1", 15, 1),
      presentStatusIds: PRESENT,
      activities: 20,
    });

    expect(result.members[0]).toEqual({
      memberId: "m1",
      firstName: "Alva",
      lastName: "Bergström",
      attended: 15,
      marked: 16,
      rate: 94,
    });
    // The gap between the two is the coverage a coach may want to close.
    expect(result.activities).toBe(20);
  });

  it("only counts statuses flagged as counting towards presence", () => {
    const result = summariseAttendance({
      members: [alva],
      records: [
        { member_id: "m1", status_id: "present" },
        { member_id: "m1", status_id: "late" }, // counts for this team
        { member_id: "m1", status_id: "ill" },
        { member_id: "m1", status_id: "absent" },
      ],
      presentStatusIds: new Set(["present", "late"]),
      activities: 4,
    });

    expect(result.members[0]?.attended).toBe(2);
    expect(result.members[0]?.marked).toBe(4);
    expect(result.members[0]?.rate).toBe(50);
  });

  it("gives a member with nothing marked no rate rather than zero", () => {
    const result = summariseAttendance({
      members: [alva],
      records: [],
      presentStatusIds: PRESENT,
      activities: 8,
    });

    expect(result.members[0]?.rate).toBeNull();
    expect(result.members[0]?.attended).toBe(0);
  });

  it("weights the team rate by records, not by member", () => {
    // Otto is 1/1 = 100%, Alva is 5/10 = 50%. Averaging the two rates would
    // say 75%; the honest answer over 11 records is 6/11 = 55%.
    const result = summariseAttendance({
      members: [alva, otto],
      records: [...records("m1", 5, 5), ...records("m3", 1, 0)],
      presentStatusIds: PRESENT,
      activities: 10,
    });

    expect(result.teamRate).toBe(55);
  });

  it("puts the lowest rate first, and the unmarked last", () => {
    const result = summariseAttendance({
      members: [alva, hugo, otto],
      records: [
        ...records("m1", 9, 1), // 90%
        ...records("m2", 5, 5), // 50%
      ],
      presentStatusIds: PRESENT,
      activities: 10,
    });

    expect(result.members.map((m) => [m.firstName, m.rate])).toEqual([
      ["Hugo", 50],
      ["Alva", 90],
      ["Otto", null],
    ]);
  });

  it("has no team rate before anyone is marked", () => {
    const result = summariseAttendance({
      members: [alva, hugo],
      records: [],
      presentStatusIds: PRESENT,
      activities: 3,
    });

    expect(result.teamRate).toBeNull();
  });
});
