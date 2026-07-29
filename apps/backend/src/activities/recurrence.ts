/**
 * Occurrence generation for recurring activities (issue #13, ADR-008).
 *
 * A series is stored as local wall time — a weekday set, a time of day, a date
 * range and an IANA zone — and this turns it into concrete instants.
 *
 * Doing it this way rather than adding 7×24h per step is the whole point:
 * Sweden moves its clocks twice a year, and a training that drifts to 17:00
 * every spring is a bug a coach notices before the developer does. Each
 * occurrence is built from *its own* local date, then resolved through the
 * zone, so 18:00 stays 18:00 across the change.
 */
import { eachDayOfInterval, getISODay, parseISO } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { MAX_SERIES_OCCURRENCES } from "@fc-app/contracts";

export interface RecurrenceRule {
  /** ISO weekday numbers, 1 = Monday … 7 = Sunday. */
  weekdays: number[];
  /** Local wall time, "HH:mm". */
  startTime: string;
  endTime: string | null;
  /** Inclusive local dates, "YYYY-MM-DD". */
  startsOn: string;
  until: string;
  timeZone: string;
}

export interface Occurrence {
  startsAt: Date;
  endsAt: Date | null;
}

/**
 * Every date in the range whose weekday is in the set, as instants.
 *
 * Throws when the rule would generate more than `MAX_SERIES_OCCURRENCES` — an
 * end date decades out is a typo, and materialising it would bury the calendar.
 */
export function generateOccurrences(rule: RecurrenceRule): Occurrence[] {
  const days = eachDayOfInterval({
    start: parseISO(rule.startsOn),
    end: parseISO(rule.until),
  });

  const wanted = new Set(rule.weekdays);
  const matching = days.filter((day) => wanted.has(getISODay(day)));

  if (matching.length > MAX_SERIES_OCCURRENCES) {
    throw new RangeError(
      `A series may not have more than ${MAX_SERIES_OCCURRENCES} occurrences`
    );
  }

  return matching.map((day) => {
    const date = toLocalDate(day);
    return {
      startsAt: toInstant(date, rule.startTime, rule.timeZone),
      endsAt:
        rule.endTime === null
          ? null
          : toInstant(date, rule.endTime, rule.timeZone),
    };
  });
}

/**
 * `eachDayOfInterval` returns dates in the *host's* zone. Only the calendar
 * date is wanted from them, so it is read back with the local getters rather
 * than through `toISOString()`, which would shift the day west of UTC.
 */
function toLocalDate(day: Date): string {
  const year = String(day.getFullYear()).padStart(4, "0");
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function toInstant(date: string, time: string, timeZone: string): Date {
  const instant = fromZonedTime(`${date}T${time}:00`, timeZone);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError(`Unknown time zone: ${timeZone}`);
  }
  return instant;
}

/**
 * The local wall time an instant falls on in a zone, "HH:mm".
 *
 * Used by "this and following" to decide whether an edit moved the time of
 * day, which is the part that carries over to later occurrences.
 */
export function localTimeOf(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

/** The local calendar date an instant falls on in a zone, "YYYY-MM-DD". */
export function localDateOf(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/**
 * Moves an instant to a different local time of day, keeping the date it falls
 * on in `timeZone`. This is what "this and following" applies to the later
 * occurrences: the time changes, the dates stay where the coach put them.
 */
export function withLocalTime(
  instant: Date,
  time: string,
  timeZone: string
): Date {
  return toInstant(localDateOf(instant, timeZone), time, timeZone);
}
