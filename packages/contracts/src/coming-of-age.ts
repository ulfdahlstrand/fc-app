/**
 * Growing up (#66).
 *
 * A member imported at eight has a parent's e-mail address and a parent who
 * answers for them. At eighteen the vårdnadshavare relationship ends in law —
 * but the family does not. This module works out *when*, so the app can say so
 * in advance; it deliberately decides nothing about access.
 *
 * Nothing here is stored. Age derived from a stored birth date is always
 * right; age written into a column is right until the next birthday.
 */

export const ADULT_AGE = 18;

/** How much warning a parent gets. Long enough to talk about it at training. */
export const NOTICE_DAYS = 30;

export interface ComingOfAge {
  /** `YYYY-MM-DD` — the day they turn eighteen. Null without a birth date. */
  eighteenthOn: string | null;
  /** Already eighteen or older. */
  isAdult: boolean;
  /** Turning eighteen within the notice window; false once they have. */
  approaching: boolean;
  /** Whole days until the birthday; negative afterwards, null without a date. */
  daysUntil: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): number {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
}

/**
 * `today` is a parameter so this is testable and so the caller decides which
 * clock counts — the browser's, in practice, since it is the person reading
 * the notice whose "today" matters.
 *
 * A 29 February birth rolls to 1 March, which is both what `Date` does and
 * what Sweden does.
 */
export function comingOfAge(
  birthDate: string | null,
  today: Date = new Date()
): ComingOfAge {
  if (birthDate === null || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return {
      eighteenthOn: null,
      isAdult: false,
      approaching: false,
      daysUntil: null,
    };
  }

  const [year = 0, month = 0, day = 0] = birthDate.split("-").map(Number);
  const eighteenth = new Date(Date.UTC(year + ADULT_AGE, month - 1, day));
  const eighteenthOn = eighteenth.toISOString().slice(0, 10);

  const daysUntil = Math.round(
    (startOfUtcDay(eighteenth) - startOfUtcDay(today)) / DAY_MS
  );

  return {
    eighteenthOn,
    isAdult: daysUntil <= 0,
    approaching: daysUntil > 0 && daysUntil <= NOTICE_DAYS,
    daysUntil,
  };
}
