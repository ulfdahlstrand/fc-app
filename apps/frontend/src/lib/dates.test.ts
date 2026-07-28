/**
 * The calendar's date maths (issue #12). These pin the two things a month grid
 * gets wrong most easily: which day a week starts on, and whether the window
 * asked of the API covers exactly the cells being drawn.
 *
 * Assertions stay timezone-independent — the suite runs wherever the developer
 * happens to be.
 */
import { describe, expect, it } from "vitest";
import {
  fromDateTimeInput,
  formatTimeRange,
  monthGridDays,
  monthGridRange,
  toDateTimeInput,
  weekdayLabels,
} from "./dates";
import { sv } from "date-fns/locale";

/** August 2026 starts on a Saturday and ends on a Monday — plenty of padding. */
const AUGUST_2026 = new Date(2026, 7, 1);

describe("monthGridDays", () => {
  it("draws whole weeks starting on Monday", () => {
    const days = monthGridDays(AUGUST_2026);

    expect(days.length % 7).toBe(0);
    expect(days[0]?.getDay()).toBe(1);
    expect(days[days.length - 1]?.getDay()).toBe(0);
  });

  it("pads with the neighbouring months' days", () => {
    const days = monthGridDays(AUGUST_2026);

    // 1 August 2026 is a Saturday, so the grid opens on Monday 27 July.
    expect(days[0]?.getMonth()).toBe(6);
    expect(days[0]?.getDate()).toBe(27);
    expect(days.some((day) => day.getMonth() === 8)).toBe(true);
  });
});

describe("monthGridRange", () => {
  it("covers every cell and stops before the next grid's first", () => {
    const days = monthGridDays(AUGUST_2026);
    const { from, to } = monthGridRange(AUGUST_2026);

    const first = days[0]!;
    const last = days[days.length - 1]!;

    expect(new Date(from).getTime()).toBeLessThanOrEqual(first.getTime());
    // Half-open: the last cell is inside the window, the day after is not.
    expect(new Date(to).getTime()).toBeGreaterThan(last.getTime());
    expect(new Date(to).getTime() - last.getTime()).toBeLessThanOrEqual(
      24 * 60 * 60 * 1000,
    );
  });
});

describe("datetime-local conversion", () => {
  it("round-trips a local wall time through the wire format", () => {
    const local = "2026-08-01T17:30";

    expect(toDateTimeInput(fromDateTimeInput(local))).toBe(local);
  });

  it("sends an instant, not a naive string", () => {
    const iso = fromDateTimeInput("2026-08-01T17:30");

    expect(iso).toMatch(/Z$/);
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
  });
});

describe("formatTimeRange", () => {
  it("shows only the start when the activity is open-ended", () => {
    const startsAt = fromDateTimeInput("2026-08-01T17:30");

    expect(formatTimeRange(startsAt, null, sv)).toBe("17:30");
    expect(
      formatTimeRange(startsAt, fromDateTimeInput("2026-08-01T19:00"), sv),
    ).toBe("17:30–19:00");
  });
});

describe("weekdayLabels", () => {
  it("starts the week on Monday", () => {
    const labels = weekdayLabels(sv);

    expect(labels).toHaveLength(7);
    expect(labels[0]).toBe("må");
    expect(labels[6]).toBe("sö");
  });
});
