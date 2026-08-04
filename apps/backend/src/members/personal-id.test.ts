/** Personnummer parsing and the read gate around it (ADR-022). */
import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import {
  formatPersonalId,
  maskPersonalId,
  parsePersonalId,
  type Permission,
} from "@fc-app/contracts";
import type { Database } from "../db/types.js";
import { loadPersonalIds, mayRevealPersonalId } from "./personal-id.js";

/** Fixed so the century inference below never depends on the calendar. */
const TODAY = new Date("2026-08-03T00:00:00Z");

function parse(raw: string, today = TODAY) {
  return parsePersonalId(raw, today);
}

describe("parsePersonalId", () => {
  it("accepts every form the same number is written in", () => {
    const forms = [
      "20170314-2412",
      "201703142412",
      "170314-2412",
      "1703142412",
      " 20170314 - 2412 ",
    ];
    for (const form of forms) {
      const result = parse(form);
      expect(result.ok, form).toBe(true);
      if (result.ok) {
        expect(result.value.value).toBe("201703142412");
        expect(result.value.birthDate).toBe("2017-03-14");
        expect(result.value.birthYear).toBe(2017);
        expect(result.value.coordinationNumber).toBe(false);
      }
    }
  });

  it("infers the century for a ten-digit number", () => {
    // 85 is in the past either way; the rule is "the reading that is under 100".
    const recent = parse("850822-3578");
    expect(recent.ok && recent.value.birthYear).toBe(1985);

    // Two digits that would land in the future belong to the previous century.
    const rolled = parse("271231-0008");
    expect(rolled.ok && rolled.value.birthYear).toBe(1927);
  });

  it("reads '+' as someone past their hundredth birthday", () => {
    const plus = parse("850822+3578");
    expect(plus.ok && plus.value.birthYear).toBe(1885);
  });

  it("rejects '+' on a number that already states its century", () => {
    expect(parse("19850822+3578").ok).toBe(false);
  });

  it("accepts a samordningsnummer and un-shifts the day", () => {
    const result = parse("19850882-3575");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.coordinationNumber).toBe(true);
      expect(result.value.birthDate).toBe("1985-08-22");
      // The stored value keeps the +60 day — it is the person's real number.
      expect(result.value.value).toBe("198508823575");
    }
  });

  it("rejects a wrong check digit", () => {
    expect(parse("20170314-2413").ok).toBe(false);
    expect(parse("19850822-3579").ok).toBe(false);
  });

  it("rejects a date that does not exist", () => {
    expect(parse("20170230-2412").ok).toBe(false);
    expect(parse("20171314-2412").ok).toBe(false);
    expect(parse("20170300-2412").ok).toBe(false);
  });

  it("rejects a birth date in the future", () => {
    const result = parse("20170314-2412", new Date("2016-01-01T00:00:00Z"));
    expect(result.ok).toBe(false);
  });

  it("rejects anything that is not a personnummer", () => {
    for (const raw of ["", "   ", "abc", "2017031424", "20170314-241", "not a number"]) {
      expect(parse(raw).ok, raw).toBe(false);
    }
  });

  it("accepts a leap day in a leap year and rejects it otherwise", () => {
    const leap = parse("20160229-1237");
    expect(leap.ok && leap.value.birthDate).toBe("2016-02-29");
    // 2017 is not a leap year, so no check digit can make this one real.
    expect(parse("20170229-1234").ok).toBe(false);
  });
});

describe("formatPersonalId / maskPersonalId", () => {
  it("formats for someone allowed to see it", () => {
    expect(formatPersonalId("201703142412")).toBe("20170314-2412");
  });

  it("masks the last four digits for everyone else", () => {
    expect(maskPersonalId("201703142412")).toBe("20170314-****");
    expect(maskPersonalId("201703142412")).not.toContain("2412");
  });

  it("masks a number that is already formatted", () => {
    expect(maskPersonalId("20170314-2412")).toBe("20170314-****");
  });
});

const MEMBER_ID = "550e8400-e29b-41d4-a716-446655440010";

/**
 * Covers the single query shape loadPersonalIds issues: members joined to the
 * club's person register (ADR-023).
 */
function fakeDb(rows: { member_id: string; personal_id: string }[]) {
  const execute = vi.fn().mockResolvedValue(rows);
  const selectFrom = vi.fn().mockReturnValue({
    innerJoin: () => ({ select: () => ({ where: () => ({ execute }) }) }),
  });
  return {
    db: { selectFrom } as unknown as Kysely<Database>,
    selectFrom,
  };
}

describe("loadPersonalIds", () => {
  const rows = [{ member_id: MEMBER_ID, personal_id: "201703142412" }];

  it("gives the full number to a caller with members.manage", async () => {
    const { db } = fakeDb(rows);
    const loaded = await loadPersonalIds(db, [MEMBER_ID], [
      "members.view",
      "members.manage",
    ]);
    expect(loaded.get(MEMBER_ID)).toBe("20170314-2412");
  });

  // This is the test ADR-022 exists for: view alone must never see the digits.
  it("never gives the last four digits to a members.view-only caller", async () => {
    const { db } = fakeDb(rows);
    const loaded = await loadPersonalIds(db, [MEMBER_ID], ["members.view"]);
    expect(loaded.get(MEMBER_ID)).toBe("20170314-****");
    expect(loaded.get(MEMBER_ID)).not.toContain("2412");
  });

  it("holds nothing for a member without a personnummer", async () => {
    const { db } = fakeDb([]);
    const loaded = await loadPersonalIds(db, [MEMBER_ID], ["members.manage"]);
    expect(loaded.has(MEMBER_ID)).toBe(false);
  });

  it("does not query at all for an empty roster", async () => {
    const { db, selectFrom } = fakeDb(rows);
    const loaded = await loadPersonalIds(db, [], ["members.manage"]);
    expect(loaded.size).toBe(0);
    expect(selectFrom).not.toHaveBeenCalled();
  });
});

describe("mayRevealPersonalId", () => {
  it("is members.manage, and nothing else", () => {
    const everythingElse: Permission[] = [
      "members.view",
      "settings.club",
      "settings.team",
      "callups.manage",
    ];
    expect(mayRevealPersonalId(everythingElse)).toBe(false);
    expect(mayRevealPersonalId(["members.manage"])).toBe(true);
  });
});
