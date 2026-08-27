/**
 * How a member is written, and the order a list of them is in (#101, ADR-010).
 *
 * Tested from here because the contracts package has no runner of its own.
 */
import { describe, expect, it } from "vitest";
import { compareMemberNames, formatMemberName } from "@fc-app/contracts";

describe("formatMemberName", () => {
  it("writes a member in reading order", () => {
    expect(formatMemberName({ firstName: "Ulf", lastName: "Dahlstrand" })).toBe(
      "Ulf Dahlstrand"
    );
  });

  it("survives an empty last name without a trailing space", () => {
    // The SportAdmin attendance page carries a full name split on the first
    // space, so a one-word name reaches this legitimately.
    expect(formatMemberName({ firstName: "Zlatan", lastName: "" })).toBe(
      "Zlatan"
    );
    expect(formatMemberName({ firstName: "", lastName: "Dahlstrand" })).toBe(
      "Dahlstrand"
    );
    expect(formatMemberName({ firstName: "", lastName: "" })).toBe("");
  });

  it("trims what the file carried", () => {
    expect(
      formatMemberName({ firstName: "  Ulf ", lastName: " Dahlstrand  " })
    ).toBe("Ulf Dahlstrand");
  });
});

describe("compareMemberNames", () => {
  const sorted = (names: [string, string][]) =>
    [...names]
      .map(([firstName, lastName]) => ({ firstName, lastName }))
      .sort(compareMemberNames)
      .map(formatMemberName);

  it("orders by first name, then last", () => {
    expect(
      sorted([
        ["Tim", "Syren Serrander"],
        ["Adam", "Gorling"],
        ["Ulf", "Dahlstrand"],
      ])
    ).toEqual(["Adam Gorling", "Tim Syren Serrander", "Ulf Dahlstrand"]);
  });

  it("falls back to the last name when the first is shared", () => {
    expect(
      sorted([
        ["Anna", "Öberg"],
        ["Anna", "Berg"],
        ["Anna", "Ärlig"],
      ])
    ).toEqual(["Anna Berg", "Anna Ärlig", "Anna Öberg"]);
  });

  it("sorts Å, Ä and Ö after Z, in that order", () => {
    // The whole point of the "sv" collation: by codepoint Ä (U+00C4) comes
    // before Å (U+00C5), which is not the Swedish alphabet.
    expect(
      sorted([
        ["Örjan", "Ek"],
        ["Åke", "Ek"],
        ["Zeb", "Ek"],
        ["Ärna", "Ek"],
        ["Bea", "Ek"],
      ])
    ).toEqual(["Bea Ek", "Zeb Ek", "Åke Ek", "Ärna Ek", "Örjan Ek"]);
  });

  it("does not put every capital before every lowercase", () => {
    expect(sorted([["bo", "Ek"], ["Bea", "Ek"]])).toEqual(["Bea Ek", "bo Ek"]);
  });
});
