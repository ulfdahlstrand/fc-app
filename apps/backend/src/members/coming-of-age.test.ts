/**
 * Working out when a member turns eighteen (#66). The dates decide what a
 * parent is told and when, so the boundaries are pinned rather than assumed.
 */
import { describe, expect, it } from "vitest";
import { comingOfAge, NOTICE_DAYS } from "@fc-app/contracts";

const TODAY = new Date("2026-08-04T00:00:00Z");

describe("comingOfAge", () => {
  it("knows the day someone turns eighteen", () => {
    const result = comingOfAge("2008-11-20", TODAY);
    expect(result.eighteenthOn).toBe("2026-11-20");
    expect(result.isAdult).toBe(false);
  });

  it("counts someone eighteen from the birthday itself, not the day after", () => {
    const onTheDay = comingOfAge("2008-08-04", TODAY);
    expect(onTheDay.isAdult).toBe(true);
    expect(onTheDay.daysUntil).toBe(0);
    // Being an adult is not a thing you are "approaching" once you are one.
    expect(onTheDay.approaching).toBe(false);
  });

  it("gives notice for the month before, and not before that", () => {
    const justInside = comingOfAge("2008-09-03", TODAY);
    expect(justInside.daysUntil).toBe(NOTICE_DAYS);
    expect(justInside.approaching).toBe(true);

    const justOutside = comingOfAge("2008-09-04", TODAY);
    expect(justOutside.daysUntil).toBe(NOTICE_DAYS + 1);
    expect(justOutside.approaching).toBe(false);
  });

  it("stays quiet about a child who is nowhere near", () => {
    const child = comingOfAge("2017-03-14", TODAY);
    expect(child.isAdult).toBe(false);
    expect(child.approaching).toBe(false);
    expect(child.eighteenthOn).toBe("2035-03-14");
  });

  it("stays quiet about an adult who passed the date long ago", () => {
    const grown = comingOfAge("1985-08-22", TODAY);
    expect(grown.isAdult).toBe(true);
    expect(grown.approaching).toBe(false);
  });

  // Sweden treats a leap-day birthday as 1 March in ordinary years, which is
  // also what Date does with an overflowing day.
  it("rolls a 29 February birth to 1 March", () => {
    expect(comingOfAge("2008-02-29", TODAY).eighteenthOn).toBe("2026-03-01");
  });

  it("says nothing at all without a birth date", () => {
    expect(comingOfAge(null, TODAY)).toEqual({
      eighteenthOn: null,
      isAdult: false,
      approaching: false,
      daysUntil: null,
    });
    expect(comingOfAge("not a date", TODAY).eighteenthOn).toBeNull();
  });
});
