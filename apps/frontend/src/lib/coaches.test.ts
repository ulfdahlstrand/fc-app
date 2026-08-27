import { describe, expect, it } from "vitest";
import {
  formatMemberName,
  type CoachCandidate,
  type MemberCoachCandidate,
} from "@fc-app/contracts";
import { sortCandidates, sortMemberCandidates } from "./coaches";

function candidate(
  name: string,
  addable: boolean,
  email = `${name}@example.test`,
): CoachCandidate {
  return { userId: name, name, email, currentRole: null, addable };
}

describe("sortCandidates", () => {
  it("puts the people who can be appointed first", () => {
    const sorted = sortCandidates([
      candidate("Bo", false),
      candidate("Åsa", true),
    ]);
    expect(sorted.map((row) => row.name)).toEqual(["Åsa", "Bo"]);
  });

  it("sorts each group by name, Swedish order", () => {
    const sorted = sortCandidates([
      candidate("Örjan", true),
      candidate("Anna", true),
      candidate("Zäta", true),
    ]);
    expect(sorted.map((row) => row.name)).toEqual(["Anna", "Zäta", "Örjan"]);
  });

  it("separates two people with the same name by address", () => {
    const sorted = sortCandidates([
      candidate("Anna Andersson", true, "b@example.test"),
      candidate("Anna Andersson", true, "a@example.test"),
    ]);
    expect(sorted.map((row) => row.email)).toEqual([
      "a@example.test",
      "b@example.test",
    ]);
  });

  it("leaves the input alone", () => {
    const input = [candidate("Bo", false), candidate("Åsa", true)];
    sortCandidates(input);
    expect(input.map((row) => row.name)).toEqual(["Bo", "Åsa"]);
  });
});

function member(
  lastName: string,
  action: MemberCoachCandidate["action"],
  firstName = "Test",
): MemberCoachCandidate {
  return {
    memberId: `${firstName} ${lastName}`,
    firstName,
    lastName,
    userId: action === "add" ? "user-1" : null,
    email: action === "add" ? "a@example.test" : null,
    accountName: null,
    willCreateAccount: false,
    action,
    blockedReason: action === "blocked" ? "noEmail" : null,
  };
}

describe("sortMemberCandidates", () => {
  it("puts everyone who can be appointed before the blocked rows", () => {
    const sorted = sortMemberCandidates([
      member("Andersson", "blocked"),
      member("Öberg", "add"),
      member("Bergström", "add"),
    ]);
    expect(sorted.map((row) => row.lastName)).toEqual([
      "Bergström",
      "Öberg",
      "Andersson",
    ]);
  });

  it("keeps the appointable rows in name order among themselves", () => {
    const sorted = sortMemberCandidates([
      member("Bergström", "add"),
      member("Andersson", "add"),
    ]);
    expect(sorted.map((row) => row.lastName)).toEqual([
      "Andersson",
      "Bergström",
    ]);
  });

  it("sorts by first name then last name, Swedish order (#101)", () => {
    const sorted = sortMemberCandidates([
      member("Ek", "add", "Örjan"),
      member("Ek", "add", "Anna"),
      member("Åberg", "add", "Bo"),
    ]);
    // The order the row reads in, and `Örjan` after `Bo` because Ö follows Z
    // in Swedish. Delegated to `compareMemberNames`, so this list and the
    // roster cannot drift apart.
    expect(sorted.map(formatMemberName)).toEqual([
      "Anna Ek",
      "Bo Åberg",
      "Örjan Ek",
    ]);
  });

  it("leaves the input alone", () => {
    const input = [member("Andersson", "blocked"), member("Bergström", "add")];
    sortMemberCandidates(input);
    expect(input.map((row) => row.lastName)).toEqual([
      "Andersson",
      "Bergström",
    ]);
  });
});
