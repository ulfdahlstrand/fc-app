/**
 * Personnummer — the identity a member is matched on (ADR-022).
 *
 * Stored normalised to twelve digits, never with a separator. Everything that
 * reads or writes one goes through here: parsing accepts what humans and
 * exports actually produce, and masking is the shape a caller without
 * `members.manage` receives.
 */

/** A personnummer that passed every check, plus what can be derived from it. */
export interface ParsedPersonalId {
  /** Twelve digits, no separator: `201703142412`. The stored form. */
  value: string;
  /** `YYYY-MM-DD`, from the number itself. Samordningsnummer are un-shifted. */
  birthDate: string;
  birthYear: number;
  /** True for a samordningsnummer (day + 60), which is not a personnummer. */
  coordinationNumber: boolean;
}

export type PersonalIdResult =
  | { ok: true; value: ParsedPersonalId }
  | { ok: false; error: string };

/** Luhn over the ten-digit form (YYMMDDNNNC), doubling from the first digit. */
function luhnOk(tenDigits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    let digit = tenDigits.charCodeAt(i) - 48;
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Round-trips through Date, so 2017-02-30 is rejected rather than shifted. */
function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

/**
 * Parses any form a personnummer is written in — `YYYYMMDD-NNNN`,
 * `YYMMDD-NNNN`, `YYMMDD+NNNN`, and the same without separators. Spaces
 * anywhere are ignored; anything else is rejected.
 *
 * `today` exists so the century inference is testable, and is the only thing
 * here that depends on when it runs.
 */
export function parsePersonalId(
  raw: string,
  today: Date = new Date()
): PersonalIdResult {
  const compact = raw.replace(/\s/g, "");
  if (compact === "") return { ok: false, error: "Missing personnummer" };

  const match = /^(\d{6}|\d{8})([-+]?)(\d{4})$/.exec(compact);
  if (!match) return { ok: false, error: "Not a personnummer" };

  const datePart = match[1] ?? "";
  const separator = match[2] ?? "";
  const suffix = match[3] ?? "";

  // A twelve-digit number states its century; a ten-digit one has to be told,
  // and "+" is the only marker Sweden has for someone past their hundredth.
  let year: number;
  if (datePart.length === 8) {
    if (separator === "+") {
      return { ok: false, error: "A twelve-digit number cannot use '+'" };
    }
    year = Number(datePart.slice(0, 4));
  } else {
    const shortYear = Number(datePart.slice(0, 2));
    const thisYear = today.getUTCFullYear();
    year = Math.floor(thisYear / 100) * 100 + shortYear;
    if (year > thisYear) year -= 100;
    if (separator === "+") year -= 100;
  }

  const month = Number(datePart.slice(-4, -2));
  const rawDay = Number(datePart.slice(-2));
  const coordinationNumber = rawDay > 60;
  const day = coordinationNumber ? rawDay - 60 : rawDay;

  if (!isRealDate(year, month, day)) {
    return { ok: false, error: "Not a real date" };
  }

  const birthDate = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  if (new Date(`${birthDate}T00:00:00Z`).getTime() > today.getTime()) {
    return { ok: false, error: "Birth date is in the future" };
  }

  const tenDigits = `${pad(year % 100, 2)}${pad(month, 2)}${pad(rawDay, 2)}${suffix}`;
  if (!luhnOk(tenDigits)) {
    return { ok: false, error: "Check digit does not match" };
  }

  return {
    ok: true,
    value: {
      value: `${pad(year, 4)}${pad(month, 2)}${pad(rawDay, 2)}${suffix}`,
      birthDate,
      birthYear: year,
      coordinationNumber,
    },
  };
}

/** `201703142412` → `20170314-2412`. For display to someone allowed to see it. */
export function formatPersonalId(value: string): string {
  const digits = value.replace(/\D/g, "");
  return `${digits.slice(0, 8)}-${digits.slice(8)}`;
}

/**
 * `201703142412` → `20170314-****`. What a caller without `members.manage`
 * receives: enough to recognise a person, not enough to identify them
 * elsewhere.
 *
 * Takes either form, so the browser can re-mask a number it was allowed to
 * fetch without keeping a second implementation of this around.
 */
export function maskPersonalId(value: string): string {
  return `${value.replace(/\D/g, "").slice(0, 8)}-****`;
}
