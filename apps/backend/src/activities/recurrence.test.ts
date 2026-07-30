/** Occurrence generation (issue #13). */
import { describe, expect, it } from "vitest";
import { MAX_SERIES_OCCURRENCES } from "@fc-app/contracts";
import {
  generateOccurrences,
  localTimeOf,
  withLocalTime,
} from "./recurrence.js";

const STOCKHOLM = "Europe/Stockholm";

const weekly = {
  weekdays: [2], // Tuesday
  startTime: "18:00",
  endTime: "19:30",
  startsOn: "2026-05-05",
  until: "2026-06-15",
  timeZone: STOCKHOLM,
};

describe("generateOccurrences", () => {
  it("creates 'every Tuesday 18:00 until June 15'", () => {
    const occurrences = generateOccurrences(weekly);

    // 5, 12, 19, 26 May and 2, 9 June — the 15th is a Monday, so it is out.
    expect(occurrences).toHaveLength(6);
    for (const occurrence of occurrences) {
      expect(localTimeOf(occurrence.startsAt, STOCKHOLM)).toBe("18:00");
      expect(localTimeOf(occurrence.endsAt!, STOCKHOLM)).toBe("19:30");
    }
  });

  it("covers several weekdays in one series", () => {
    const occurrences = generateOccurrences({
      ...weekly,
      weekdays: [2, 4], // Tuesdays and Thursdays
      until: "2026-05-18",
    });

    expect(occurrences.map((o) => o.startsAt.toISOString().slice(0, 10)))
      .toEqual(["2026-05-05", "2026-05-07", "2026-05-12", "2026-05-14"]);
  });

  it("keeps the local time across a DST change", () => {
    // Sweden moves its clocks on 29 March 2026: before it, 18:00 is 17:00Z;
    // after it, 16:00Z. Naive 7×24h stepping would drift by that hour.
    const occurrences = generateOccurrences({
      ...weekly,
      weekdays: [1], // Mondays
      startsOn: "2026-03-23",
      until: "2026-04-06",
      endTime: null,
    });

    expect(occurrences).toHaveLength(3);
    expect(occurrences[0]?.startsAt.toISOString()).toBe(
      "2026-03-23T17:00:00.000Z",
    );
    expect(occurrences[1]?.startsAt.toISOString()).toBe(
      "2026-03-30T16:00:00.000Z",
    );
    for (const occurrence of occurrences) {
      expect(localTimeOf(occurrence.startsAt, STOCKHOLM)).toBe("18:00");
    }
  });

  it("leaves the end open when the series has no end time", () => {
    const occurrences = generateOccurrences({ ...weekly, endTime: null });

    expect(occurrences.every((occurrence) => occurrence.endsAt === null)).toBe(
      true,
    );
  });

  it("refuses a range that would bury the calendar", () => {
    expect(() =>
      generateOccurrences({ ...weekly, weekdays: [1, 2, 3, 4, 5, 6, 7], until: "2036-06-15" }),
    ).toThrow(RangeError);
  });

  it("allows a series right up to the ceiling", () => {
    const occurrences = generateOccurrences({
      ...weekly,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      startsOn: "2026-01-01",
      until: "2026-12-31",
    });

    expect(occurrences.length).toBe(365);
    expect(occurrences.length).toBeLessThanOrEqual(MAX_SERIES_OCCURRENCES);
  });
});

describe("withLocalTime", () => {
  it("moves the time of day but keeps the date", () => {
    const [first] = generateOccurrences(weekly);
    const moved = withLocalTime(first!.startsAt, "19:15", STOCKHOLM);

    expect(localTimeOf(moved, STOCKHOLM)).toBe("19:15");
    expect(moved.toISOString().slice(0, 10)).toBe("2026-05-05");
  });
});
