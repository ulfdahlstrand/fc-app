/**
 * Reading a hand-filled attendance sheet (#86).
 *
 * #84 reads SportAdmin's own page, which is exact but only helps teams coming
 * from SportAdmin. This is the format for everyone else: a matrix, one row per
 * member and one column per activity — the same shape as the screen a coach
 * would be copying from, and the only shape reasonable to type. Twenty-five
 * players across sixty trainings is twenty-five rows here and fifteen hundred
 * in a one-mark-per-row file.
 *
 *     Förnamn;Efternamn;2026-01-14;2026-01-21 | 13:00 | Match | vs Skiljebo SK
 *     Ture;Dahlstrand;N;F
 *
 * A column header is a date followed by pipe-separated fields in fixed
 * positions — `YYYY-MM-DD [ | HH:MM ] [ | typ ] [ | titel ]`. **Positional,
 * not name-keyed**, which is the rule the member import arrived at and for a
 * related reason: a header typed by hand will be misspelled, and guessing
 * which field `Trening` was meant to be is worse than counting pipes. An empty
 * field keeps the wizard's default, so `2026-01-21 | | Match` is a match at
 * the default time.
 *
 * Everything downstream is shared with #84 — the same wire rows, the same
 * planner, the same commit. Nothing in the backend learns a second format.
 *
 * Pure functions with their own tests (ADR-016).
 */
import type { ImportActivity, ImportAttendanceRow } from "@fc-app/contracts";

/** A cell as a reader hands it over: a spreadsheet may give real Dates. */
export type SheetCell = string | number | Date | boolean | null | undefined;

export interface SheetDefaults {
  /** Used by a column header that names only a date. */
  time: string;
  typeName: string;
}

export interface SheetColumn {
  index: number;
  date: string;
  time: string;
  typeName: string;
  title: string | null;
}

export interface SheetProblem {
  /** A column header that is not a date, or a row with no name. */
  kind: "badHeader" | "namelessRow" | "ignoredColumn";
  /** 1-based, so it can be pointed at in a spreadsheet. */
  at: number;
  detail: string;
}

export interface ParsedSheet {
  columns: SheetColumn[];
  rows: {
    rowNumber: number;
    firstName: string;
    lastName: string;
    externalRef: string | null;
    /** Column index → the raw cell value, trimmed. Blanks are left out. */
    marks: Record<string, string>;
  }[];
  /** Distinct cell values, for the mapping step. */
  values: string[];
  problems: SheetProblem[];
}

/** Identity columns, recognised by name — these are few and the template writes them. */
const NAME_HEADERS: Record<string, "firstName" | "lastName" | "externalRef"> = {
  förnamn: "firstName",
  fornamn: "firstName",
  "first name": "firstName",
  efternamn: "lastName",
  "last name": "lastName",
  "medlems nr": "externalRef",
  medlemsnr: "externalRef",
  "member no": "externalRef",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{1,2}[:.]\d{2}$/;

function text(cell: SheetCell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) {
    // A spreadsheet reader turns "2026-01-14" into a Date. Take the local
    // parts, not the ISO string: an instant a few hours either side of
    // midnight would otherwise land on the day before.
    const y = String(cell.getFullYear()).padStart(4, "0");
    const m = String(cell.getMonth() + 1).padStart(2, "0");
    const d = String(cell.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(cell).trim();
}

/**
 * A CSV as a spreadsheet writes one: `;` where a Swedish Excel put it, `,`
 * otherwise, quotes doubled inside quotes, and a byte-order mark to drop.
 */
export function parseCsv(source: string): string[][] {
  const input = source.replace(/^﻿/, "");
  const firstLine = input.slice(0, input.indexOf("\n") + 1 || undefined);
  // Count outside quotes is overkill for a header of dates and names; the
  // more frequent of the two wins, which is what a spreadsheet meant.
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] as string;
    if (quoted) {
      if (char !== '"') field += char;
      else if (input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/** `2026-01-21 | 13:00 | Match | vs Skiljebo` → a column, or null. */
function readHeader(
  header: string,
  index: number,
  defaults: SheetDefaults,
): SheetColumn | null {
  const [date, time, typeName, title] = header.split("|").map((p) => p.trim());
  if (!date || !ISO_DATE.test(date)) return null;
  if (time && !CLOCK.test(time)) return null;
  return {
    index,
    date,
    time: time ? time.replace(".", ":").padStart(5, "0") : defaults.time,
    typeName: typeName || defaults.typeName,
    title: title || null,
  };
}

export function parseAttendanceSheet(
  grid: SheetCell[][],
  defaults: SheetDefaults,
): ParsedSheet {
  const header = (grid[0] ?? []).map(text);
  const problems: SheetProblem[] = [];

  const identity = new Map<"firstName" | "lastName" | "externalRef", number>();
  const columns: SheetColumn[] = [];

  header.forEach((cell, index) => {
    const known = NAME_HEADERS[cell.toLowerCase()];
    if (known !== undefined) {
      if (!identity.has(known)) identity.set(known, index);
      return;
    }
    if (cell === "") return;
    const column = readHeader(cell, index, defaults);
    if (column) {
      columns.push(column);
      return;
    }
    // Not an identity column and not a date. Said out loud rather than
    // dropped: a coach who filled in a column deserves to know it went
    // nowhere. Personnummer lands here — matching is by name (see #84).
    problems.push({ kind: "ignoredColumn", at: index + 1, detail: cell });
  });

  if (!identity.has("firstName")) {
    problems.push({ kind: "badHeader", at: 1, detail: "Förnamn" });
  }

  const first = identity.get("firstName");
  const last = identity.get("lastName");
  const ref = identity.get("externalRef");
  const values = new Set<string>();

  const rows: ParsedSheet["rows"] = [];
  grid.slice(1).forEach((cells, offset) => {
    const rowNumber = offset + 2;
    // The template ends with `#` lines explaining the format. They come back
    // when the filled-in file is imported, and a note to the reader is not a
    // member.
    if (text(cells[0]).startsWith("#")) return;
    const firstName = first === undefined ? "" : text(cells[first]);
    const lastName = last === undefined ? "" : text(cells[last]);
    if (firstName === "") {
      problems.push({ kind: "namelessRow", at: rowNumber, detail: "" });
      return;
    }
    const marks: Record<string, string> = {};
    columns.forEach((column, position) => {
      const value = text(cells[column.index]);
      // A blank cell is unmarked, and unmarked is not absent — the rate is
      // attended ÷ marked (ADR-012), so it must write nothing at all.
      if (value === "") return;
      marks[String(position)] = value;
      values.add(value);
    });
    rows.push({
      rowNumber,
      firstName,
      lastName,
      externalRef: ref === undefined ? null : text(cells[ref]) || null,
      marks,
    });
  });

  return { columns, rows, values: [...values].sort(), problems };
}

/**
 * The same wire shape #84 produces, so the planner, the preview and the
 * commit never learn that a second format exists.
 *
 * `confirmed` is true throughout: unlike SportAdmin's grid, which knows which
 * activities were registered, a column somebody typed exists because they
 * typed it. `externalRef` is null, so activities fall back to their natural
 * key — see "what this format cannot do" in #86.
 */
export function toImportInput(sheet: ParsedSheet): {
  activities: ImportActivity[];
  rows: ImportAttendanceRow[];
} {
  return {
    activities: sheet.columns.map((column) => ({
      externalRef: null,
      date: column.date,
      time: column.time,
      typeName: column.typeName,
      title: column.title,
      confirmed: true,
      lokEligible: true,
    })),
    rows: sheet.rows.map((row) => ({
      rowNumber: row.rowNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      externalRef: row.externalRef,
      marks: row.marks,
    })),
  };
}

/**
 * An empty sheet with the team's **actual roster** already in the identity
 * columns, and its real status names listed above them.
 *
 * Not a convenience feature: it is what makes name matching a solved problem
 * rather than the main source of errors in a file filled in at eleven at
 * night.
 */
export function attendanceTemplate(
  members: { firstName: string; lastName: string }[],
  statuses: { name: string }[],
): string {
  // The example columns are deliberately *not* valid dates. A template
  // returned with its examples still in it would otherwise create two real
  // activities that never happened; as placeholders they are reported as
  // ignored columns instead, which says what to do about them.
  const lines = [
    [
      "Förnamn",
      "Efternamn",
      "ÅÅÅÅ-MM-DD",
      "ÅÅÅÅ-MM-DD | 13:00 | Match | vs Skiljebo SK",
    ].join(";"),
    ...members.map((member) =>
      [member.firstName, member.lastName, "", ""].join(";"),
    ),
    "",
    `# Byt ut ÅÅÅÅ-MM-DD mot riktiga datum, en kolumn per aktivitet.`,
    `# Rubrik: datum | tid | typ | titel — bara datumet krävs, resten kan utelämnas.`,
    `# Statusar i laget: ${statuses.map((s) => s.name).join(", ")}`,
    `# Tom ruta = ingen uppgift, inte frånvaro.`,
  ];
  // A BOM, so a Swedish Excel opens it as UTF-8 rather than as mojibake.
  return `﻿${lines.join("\n")}\n`;
}
