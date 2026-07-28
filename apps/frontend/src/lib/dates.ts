/**
 * Date handling for the calendar (issue #12), on top of date-fns.
 *
 * Two conversions run through here and nowhere else:
 *
 *  - **Wire ↔ screen.** The API speaks ISO instants with an offset; the UI
 *    speaks the viewer's local wall time. `new Date(iso)` and the formatters
 *    below do that translation in the browser's own zone.
 *  - **Wire ↔ `<input type="datetime-local">`.** That input has no zone at
 *    all: it holds "2026-08-01T17:30" and means "17:30 where I am". So it is
 *    parsed and rendered as local time, never with `toISOString()` slicing.
 *
 * Weeks start on Monday — this is a Swedish football club, and the sketches
 * run Mon–Sun.
 */
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getISODay,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  type Locale,
} from "date-fns";
import { enGB, sv } from "date-fns/locale";
import { useTranslation } from "react-i18next";

/** Monday. date-fns takes the day index, and both locales here agree on it. */
const WEEK_STARTS_ON = 1 as const;

/** Kit's house separator — a fact joined to its qualifier. */
export const SEPARATOR = " · ";

const LOCALES: Record<string, Locale> = { sv, en: enGB };

/** The date-fns locale for the active i18n language, defaulting to Swedish. */
export function useDateLocale(): Locale {
  const { i18n } = useTranslation();
  return LOCALES[i18n.language.split("-")[0] ?? "sv"] ?? sv;
}

/**
 * The six-week grid a month calendar draws: whole weeks, Monday first, padded
 * with the neighbouring months' days so every row is full.
 */
export function monthGridDays(month: Date): Date[] {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_STARTS_ON }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_STARTS_ON }),
  });
}

/**
 * The half-open window to ask the API for, covering the whole grid: `to` is
 * the first instant *after* the last cell, so two adjacent months never both
 * claim the same activity.
 */
export function monthGridRange(month: Date): { from: string; to: string } {
  const days = monthGridDays(month);
  const first = days[0] ?? startOfMonth(month);
  const last = days[days.length - 1] ?? endOfMonth(month);
  return {
    from: startOfDay(first).toISOString(),
    to: startOfDay(addDays(last, 1)).toISOString(),
  };
}

/** Weekday headers for the grid, Monday first ("mån", "tis", …). */
export function weekdayLabels(locale: Locale): string[] {
  const monday = startOfWeek(new Date(), { weekStartsOn: WEEK_STARTS_ON });
  return Array.from({ length: 7 }, (_, index) =>
    format(addDays(monday, index), "EEEEEE", { locale }),
  );
}

export function shiftMonth(month: Date, delta: number): Date {
  return startOfMonth(addMonths(month, delta));
}

/** "17:30" */
export function formatTime(iso: string, locale: Locale): string {
  return format(new Date(iso), "HH:mm", { locale });
}

/**
 * "17:30–19:00", or just the start when the activity is open-ended. An en
 * dash, unspaced — the sketches set time ranges that way.
 */
export function formatTimeRange(
  startsAt: string,
  endsAt: string | null,
  locale: Locale,
): string {
  const start = formatTime(startsAt, locale);
  return endsAt === null ? start : `${start}–${formatTime(endsAt, locale)}`;
}

/** "1 augusti 2026" — the detail page's date line. */
export function formatDateLong(iso: string, locale: Locale): string {
  return format(new Date(iso), "d MMMM yyyy", { locale });
}

/** "Lördag 1 augusti" — a day heading in the list view. */
export function formatDayHeading(day: Date, locale: Locale): string {
  return format(day, "EEEE d MMMM", { locale });
}

/** "Augusti 2026" — the month title. Anton renders it uppercase. */
export function formatMonthTitle(month: Date, locale: Locale): string {
  return format(month, "LLLL yyyy", { locale });
}

/** The value an `<input type="datetime-local">` holds for an ISO instant. */
export function toDateTimeInput(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
}

/** The ISO instant an `<input type="datetime-local">` value means locally. */
export function fromDateTimeInput(value: string): string {
  return new Date(value).toISOString();
}

/** A default slot for a new activity: the next day at 17:30, an hour and a half long. */
export function defaultActivitySlot(day: Date = new Date()): {
  startsAt: string;
  endsAt: string;
} {
  const start = startOfDay(day);
  start.setHours(17, 30, 0, 0);
  const end = new Date(start.getTime() + 90 * 60 * 1000);
  return {
    startsAt: format(start, "yyyy-MM-dd'T'HH:mm"),
    endsAt: format(end, "yyyy-MM-dd'T'HH:mm"),
  };
}

// --- Recurring activities (#13) -------------------------------------------
//
// A series is stored as local wall time, so these deal in "YYYY-MM-DD",
// "HH:mm" and ISO weekday numbers rather than instants.

/** ISO weekday numbers in display order, Monday first. */
export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** The value a `<input type="date">` holds for a local date. */
export function toDateInput(day: Date): string {
  return format(day, "yyyy-MM-dd");
}

/** The value a `<input type="time">` holds for a local time. */
export function toTimeInput(day: Date): string {
  return format(day, "HH:mm");
}

/** The local calendar date an ISO instant falls on, "YYYY-MM-DD". */
export function localDateOf(iso: string): string {
  return toDateInput(new Date(iso));
}

/** The local wall time an ISO instant falls on, "HH:mm". */
export function localTimeOf(iso: string): string {
  return toTimeInput(new Date(iso));
}

/** "YYYY-MM-DD" → the ISO weekday it falls on (1 = Monday). */
export function isoWeekdayOf(date: string): number {
  return getISODay(parseISO(date));
}

/** Short weekday names keyed by ISO number, for the recurrence picker. */
export function isoWeekdayLabels(locale: Locale): Record<number, string> {
  const monday = startOfWeek(new Date(), { weekStartsOn: WEEK_STARTS_ON });
  return Object.fromEntries(
    ISO_WEEKDAYS.map((weekday, index) => [
      weekday,
      format(addDays(monday, index), "EEEEEE", { locale }),
    ]),
  );
}

/**
 * The browser's IANA zone, sent with a new series so the backend can generate
 * occurrences at the right local time. Falls back to Sweden — this is a
 * Swedish club app, and a wrong-by-an-hour series beats a failed one.
 */
export function browserTimeZone(): string {
  return (
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Stockholm"
  );
}

/** "5 maj 2026 – 15 juni 2026", the way a season states its range. */
export function formatDateRange(
  startsOn: string,
  endsOn: string,
  locale: Locale,
): string {
  const start = format(parseISO(startsOn), "d MMM yyyy", { locale });
  const end = format(parseISO(endsOn), "d MMM yyyy", { locale });
  return `${start} – ${end}`;
}

export { isSameDay, isSameMonth, startOfDay, startOfMonth };
