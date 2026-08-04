/**
 * Matching a file row to an existing member (#63). A wrong match overwrites
 * someone else's record and a missed one duplicates a child, so these pin both
 * the order of the rules and the cases where the answer must be "I don't know".
 */
import { describe, expect, it } from "vitest";
import {
  buildMatchIndex,
  collectGuardianEmails,
  findFileCollisions,
  matchImportRow,
  type ExistingMember,
  type RowIdentity,
} from "./import-match.js";

const TURE: ExistingMember = {
  id: "member-ture",
  firstName: "Ture",
  lastName: "Dahlstrand",
  birthDate: "2017-03-14",
  email: "ulf.d.dahlstrand@gmail.com",
  phone: null,
  externalRef: null,
  personalId: "201703142412",
};

const ULF: ExistingMember = {
  id: "member-ulf",
  firstName: "Ulf",
  lastName: "Dahlstrand",
  birthDate: "1985-08-22",
  email: "ulf.d.dahlstrand@gmail.com",
  phone: "0700838161",
  externalRef: "4711",
  personalId: "198508223578",
};

function row(overrides: Partial<RowIdentity> = {}): RowIdentity {
  return {
    rowNumber: 1,
    personalId: null,
    externalRef: null,
    firstName: "Ture",
    lastName: "Dahlstrand",
    birthDate: null,
    email: null,
    ...overrides,
  };
}

const NO_GUARDIANS = new Set<string>();

describe("matchImportRow", () => {
  const index = buildMatchIndex([TURE, ULF]);

  it("matches on the personnummer first", () => {
    const result = matchImportRow(
      index,
      row({ personalId: "198508223578", firstName: "Ulf" }),
      NO_GUARDIANS
    );
    expect(result).toEqual({
      kind: "matched",
      memberId: "member-ulf",
      matchedBy: "personalId",
    });
  });

  // People change their names; the number is what identifies them.
  it("still matches on the personnummer when the name disagrees", () => {
    const result = matchImportRow(
      index,
      row({ personalId: "201703142412", lastName: "Andersson" }),
      NO_GUARDIANS
    );
    expect(result).toEqual({
      kind: "matched",
      memberId: "member-ture",
      matchedBy: "personalId",
    });
  });

  it("falls back to the external ref, ignoring case and padding", () => {
    const result = matchImportRow(
      index,
      row({ externalRef: " 4711 ", firstName: "Ulf" }),
      NO_GUARDIANS
    );
    expect(result).toEqual({
      kind: "matched",
      memberId: "member-ulf",
      matchedBy: "externalRef",
    });
  });

  it("then name plus birth date, normalising whitespace and case", () => {
    const result = matchImportRow(
      index,
      row({
        firstName: "  ture ",
        lastName: "DAHLSTRAND",
        birthDate: "2017-03-14",
      }),
      NO_GUARDIANS
    );
    expect(result).toEqual({
      kind: "matched",
      memberId: "member-ture",
      matchedBy: "nameAndBirthDate",
    });
  });

  it("does not match on a name without a birth date", () => {
    expect(matchImportRow(index, row(), NO_GUARDIANS)).toEqual({ kind: "none" });
  });

  it("matches on e-mail only when it is nobody's guardian address", () => {
    const asMember = matchImportRow(
      index,
      row({ firstName: "Nils", lastName: "Wester", email: "solo@example.com" }),
      NO_GUARDIANS
    );
    expect(asMember).toEqual({ kind: "none" });

    const soloIndex = buildMatchIndex([
      { ...TURE, id: "member-solo", email: "solo@example.com" },
    ]);
    expect(
      matchImportRow(
        soloIndex,
        row({ firstName: "Nils", email: "  SOLO@example.com " }),
        NO_GUARDIANS
      )
    ).toEqual({
      kind: "matched",
      memberId: "member-solo",
      matchedBy: "email",
    });
  });

  /**
   * The case the whole rule exists for: a child carries their father's
   * address, so matching on it would merge the child into the parent.
   */
  it("refuses to match a child on their parent's e-mail", () => {
    const guardians = new Set(["ulf.d.dahlstrand@gmail.com"]);
    const result = matchImportRow(
      index,
      row({ firstName: "Sixten", email: "ulf.d.dahlstrand@gmail.com" }),
      guardians
    );
    expect(result).toEqual({ kind: "none" });
  });

  it("says ambiguous rather than guessing between two namesakes", () => {
    const twins = buildMatchIndex([
      { ...TURE, id: "a" },
      { ...TURE, id: "b" },
    ]);
    expect(
      matchImportRow(twins, row({ birthDate: "2017-03-14" }), NO_GUARDIANS)
    ).toEqual({ kind: "ambiguous", matchedBy: "nameAndBirthDate" });
  });

  it("says ambiguous when two members share an e-mail", () => {
    const shared = buildMatchIndex([TURE, ULF]);
    expect(
      matchImportRow(
        shared,
        row({ firstName: "Nils", email: "ulf.d.dahlstrand@gmail.com" }),
        NO_GUARDIANS
      )
    ).toEqual({ kind: "ambiguous", matchedBy: "email" });
  });

  it("finds nothing for someone genuinely new", () => {
    expect(
      matchImportRow(
        index,
        row({
          personalId: "201205141235",
          firstName: "Maja",
          lastName: "Ahl",
          birthDate: "2012-05-14",
        }),
        NO_GUARDIANS
      )
    ).toEqual({ kind: "none" });
  });
});

describe("collectGuardianEmails", () => {
  it("gathers every guardian address in the file, normalised", () => {
    const emails = collectGuardianEmails([
      {
        contacts: [
          { email: "My.Dahlstrand@gmail.com" },
          { email: null },
          { email: " ULF.D.DAHLSTRAND@gmail.com " },
        ],
      },
      { contacts: [] },
    ]);
    expect([...emails].sort()).toEqual([
      "my.dahlstrand@gmail.com",
      "ulf.d.dahlstrand@gmail.com",
    ]);
  });
});

describe("findFileCollisions", () => {
  it("flags both rows when two claim the same personnummer", () => {
    const collisions = findFileCollisions([
      { rowNumber: 2, personalId: "201703142412", memberId: null },
      { rowNumber: 7, personalId: "201703142412", memberId: null },
    ]);
    expect(collisions.get(2)).toBe(7);
    expect(collisions.get(7)).toBe(2);
  });

  it("flags two rows resolving to one member", () => {
    const collisions = findFileCollisions([
      { rowNumber: 3, personalId: null, memberId: "member-ture" },
      { rowNumber: 9, personalId: null, memberId: "member-ture" },
    ]);
    expect(collisions.get(9)).toBe(3);
  });

  it("leaves a clean file alone", () => {
    const collisions = findFileCollisions([
      { rowNumber: 1, personalId: "201703142412", memberId: "member-ture" },
      { rowNumber: 2, personalId: "198508223578", memberId: "member-ulf" },
      { rowNumber: 3, personalId: null, memberId: null },
      { rowNumber: 4, personalId: null, memberId: null },
    ]);
    expect(collisions.size).toBe(0);
  });
});
