/** Splitting the roster into group sections (#99). */
import { describe, expect, it } from "vitest";
import type { Member } from "@fc-app/contracts";
import { groupMembers } from "./member-grouping";

function member(id: string, firstName = id): Member {
  return {
    id,
    teamId: "team",
    firstName,
    lastName: "Testsson",
    birthYear: null,
    birthDate: null,
    personalId: null,
    externalRef: null,
    email: null,
    phone: null,
    archived: false,
    customFields: {},
  };
}

const GROUPS = [
  { id: "a", name: "A-truppen" },
  { id: "b", name: "B-truppen" },
  { id: "c", name: "Född 2014" },
];

const UNGROUPED = "Utan grupp";

const sectionShape = (sections: ReturnType<typeof groupMembers>) =>
  sections.map((section) => [
    section.name,
    section.members.map((m) => m.id),
  ]);

describe("groupMembers", () => {
  it("puts a member in several groups under the first one only", () => {
    const sections = groupMembers(
      [member("one")],
      // Server order: by group name, so `A-truppen` leads.
      { one: ["a", "c"] },
      GROUPS,
      UNGROUPED
    );

    expect(sectionShape(sections)).toEqual([["A-truppen", ["one"]]]);
  });

  it("collects members in no group last, under their own heading", () => {
    const sections = groupMembers(
      [member("one"), member("two"), member("three")],
      { one: ["c"], three: ["a"] },
      GROUPS,
      UNGROUPED
    );

    expect(sectionShape(sections)).toEqual([
      ["A-truppen", ["three"]],
      ["Född 2014", ["one"]],
      ["Utan grupp", ["two"]],
    ]);
  });

  it("drops sections a search emptied instead of heading nothing", () => {
    const sections = groupMembers(
      [member("one")],
      { one: ["b"] },
      GROUPS,
      UNGROUPED
    );

    expect(sectionShape(sections)).toEqual([["B-truppen", ["one"]]]);
  });

  it("leaves out the ungrouped section when everybody has a group", () => {
    const sections = groupMembers(
      [member("one"), member("two")],
      { one: ["a"], two: ["b"] },
      GROUPS,
      UNGROUPED
    );

    expect(sections.some((section) => section.groupId === null)).toBe(false);
  });

  it("keeps the server's order inside a section", () => {
    // The list arrives sorted by `compareMemberNames`; grouping must not
    // re-sort it, or the sections and the flat list would disagree.
    const sections = groupMembers(
      [member("m1", "Åsa"), member("m2", "Bea"), member("m3", "Örjan")],
      { m1: ["a"], m2: ["a"], m3: ["a"] },
      GROUPS,
      UNGROUPED
    );

    expect(sections[0]?.members.map((m) => m.firstName)).toEqual([
      "Åsa",
      "Bea",
      "Örjan",
    ]);
  });

  it("gives one ungrouped section when the team has no groups at all", () => {
    const sections = groupMembers(
      [member("one"), member("two")],
      {},
      [],
      UNGROUPED
    );

    expect(sectionShape(sections)).toEqual([["Utan grupp", ["one", "two"]]]);
  });

  it("ignores a group id the team does not have", () => {
    // A stale id from another team must not invent a nameless section.
    const sections = groupMembers(
      [member("one")],
      { one: ["elsewhere"] },
      GROUPS,
      UNGROUPED
    );

    expect(sectionShape(sections)).toEqual([["Utan grupp", ["one"]]]);
  });

  it("counts the rows it drew, not the group's real size", () => {
    // `two` is in both A and C; C therefore shows one row, not two.
    const sections = groupMembers(
      [member("one"), member("two")],
      { one: ["c"], two: ["a", "c"] },
      GROUPS,
      UNGROUPED
    );

    expect(sectionShape(sections)).toEqual([
      ["A-truppen", ["two"]],
      ["Född 2014", ["one"]],
    ]);
  });
});
