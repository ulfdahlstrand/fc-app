/**
 * Reading SportAdmin's "Rapportera närvaro" page (#84).
 *
 * SportAdmin has no attendance export, so this reads the page itself. That is
 * not the compromise it sounds like: the markup carries the data exactly,
 * and — the fact everything else rests on — **every cell of the grid names
 * both its activity and its member**:
 *
 *     onmouseover="aOn(a30456400,m4214437,this)"
 *
 * So nothing here counts columns or aligns rows by position. A page that
 * changes its layout still parses; one that stops emitting those handlers
 * fails loudly instead of quietly producing a season of wrong marks.
 *
 * Four more things the markup decides, none of which are guessed:
 *
 * - the activity type is a `title` ("Träning", "Tävling", "Övrigt"), never
 *   inferred from the time of day;
 * - presence is `background:#CCFFCC` on the cell. The pencil icon is a link
 *   ("Vill du ändra till Ej LOK-stöd?") and `*` marks a leader mark that is
 *   already non-LOK — both sit on cells that are green anyway;
 * - an activity is *confirmed* when its Bekräfta checkbox can be turned off
 *   (`aktivitetOFF_pk`). An unconfirmed one was never registered, so it yields
 *   no marks at all;
 * - blue (`bgcolor="D9EDF7"`) means *ej LOK-stöd*, not a kind of activity. In
 *   real data a blue column is a genuine `Tävling`, so it is reported and
 *   never used to filter.
 *
 * Pure functions with their own tests (ADR-016). Parsing happens in the
 * browser and only the structured rows are sent (ADR-001).
 */

import type {
  ImportActivity,
  ImportAttendanceRow,
} from "@fc-app/contracts";

/** What a grid cell says. Anything else is unmarked and has no entry. */
export type CellValue = "present" | "absent";

export interface ParsedActivity {
  /** SportAdmin's own activity id — the identity the import matches on. */
  externalRef: string;
  /** Day of month; the year is not on the page (see `assignYears`). */
  month: number;
  day: number;
  time: string;
  typeName: string;
  confirmed: boolean;
  lokEligible: boolean;
}

export interface ParsedMember {
  externalRef: string;
  firstName: string;
  lastName: string;
  birthYear: string | null;
  /**
   * SportAdmin prefixes a leading "-" to someone who has left the group. They
   * keep their history, so the marks are still real — but they are not on the
   * roster being imported into, and a coach should get to decide whether they
   * come along rather than meeting them as an unmatched-name error.
   */
  former: boolean;
}

export interface ParsedPage {
  /** The selected option of the group picker, e.g. "2026 Fotboll - P 17:4". */
  groupName: string | null;
  activities: ParsedActivity[];
  members: ParsedMember[];
  /** `activityRef|memberRef` → what that cell says. */
  marks: Map<string, CellValue>;
}

const MONTHS: Record<string, number> = {
  januari: 1, februari: 2, mars: 3, april: 4, maj: 5, juni: 6,
  juli: 7, augusti: 8, september: 9, oktober: 10, november: 11, december: 12,
};

const PRESENT_BACKGROUND = "#ccffcc";
const NON_LOK_BACKGROUND = "d9edf7";

/**
 * The file is windows-1252, not UTF-8 — read as UTF-8 it loses every å, ä and
 * ö, and with them every name the import matches on.
 */
export function decodeSportAdminPage(bytes: ArrayBuffer): string {
  return new TextDecoder("windows-1252").decode(bytes);
}

function textOf(node: Element | null): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** "17" + "00" → "17:00", from the `<font>17<sup>00</sup></font>` clock. */
function clockOf(cell: Element): string | null {
  const match = /(\d{1,2})\D*?(\d{2})\s*$/.exec(textOf(cell));
  if (!match) return null;
  return `${(match[1] as string).padStart(2, "0")}:${match[2]}`;
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

/**
 * One saved `narvaro_IFRAME.html`. The page paginates, so a season is several
 * of these — see `mergePages`.
 */
export function parseAttendancePage(html: string): ParsedPage {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Header: the month row spans its columns, the day row carries the activity
  // ids, and the time row carries the type. All three are read in document
  // order and zipped — they are the one place position is unavoidable, so
  // a mismatch throws rather than producing a shifted season.
  const monthCells = [...doc.querySelectorAll("td.kort4")];
  const months: number[] = [];
  for (const cell of monthCells) {
    const month = MONTHS[textOf(cell).toLowerCase()];
    if (month === undefined) continue;
    const span = Number(cell.getAttribute("colspan") ?? "1");
    for (let i = 0; i < span; i += 1) months.push(month);
  }

  const dayCells = [...doc.querySelectorAll('td.kort3[id^="a"]')];
  const timeCells = [...doc.querySelectorAll("td.kort5")];
  if (dayCells.length !== timeCells.length || dayCells.length !== months.length) {
    throw new Error(
      `Attendance header does not line up: ${months.length} months, ` +
        `${dayCells.length} days, ${timeCells.length} times`
    );
  }

  // A confirmed activity offers to be un-confirmed; that is the only place
  // the page says whether anyone ever registered it.
  const confirmed = new Set(
    [...html.matchAll(/aktivitetOFF_pk\.value=(\d+)/g)].map((m) => m[1] as string)
  );

  const activities: ParsedActivity[] = dayCells.map((dayCell, index) => {
    const timeCell = timeCells[index] as Element;
    const externalRef = (dayCell.getAttribute("id") ?? "").slice(1);
    const day = Number(textOf(dayCell));
    const time = clockOf(timeCell);
    // A non-LOK column hangs its title on an inner <span> rather than the
    // <td>, so ask the cell and its descendants alike.
    const titled = timeCell.hasAttribute("title")
      ? timeCell
      : timeCell.querySelector("[title]");
    const typeName = titled?.getAttribute("title")?.trim() ?? "";
    if (!externalRef || !Number.isFinite(day) || !time || !typeName) {
      throw new Error(`Unreadable activity column at index ${index}`);
    }
    return {
      externalRef,
      month: months[index] as number,
      day,
      time,
      typeName,
      confirmed: confirmed.has(externalRef),
      lokEligible: !(timeCell.getAttribute("bgcolor") ?? "")
        .toLowerCase()
        .includes(NON_LOK_BACKGROUND),
    };
  });

  // Members: the left-hand table. The year is read off the row itself rather
  // than the document, so a row shaped differently from its neighbours cannot
  // lend its birth year to the next one.
  const members: ParsedMember[] = [];
  for (const cell of doc.querySelectorAll('td[id^="m"]')) {
    const link = cell.querySelector("a[onclick*=showProfileCard]");
    if (!link) continue;
    const externalRef = (cell.getAttribute("id") ?? "").slice(1);
    const year = /(\d{4})/.exec(textOf(cell.querySelector("div")))?.[1] ?? null;
    const label = textOf(link);
    const former = label.startsWith("-");
    members.push({
      externalRef,
      ...splitName(former ? label.replace(/^-\s*/, "") : label),
      birthYear: year,
      former,
    });
  }

  const marks = new Map<string, CellValue>();
  for (const cell of doc.querySelectorAll("td[onmouseover]")) {
    const handler = cell.getAttribute("onmouseover") ?? "";
    const match = /aOn\(a(\d+),m(\d+),/.exec(handler);
    if (!match) continue;
    const green = (cell.getAttribute("style") ?? "")
      .toLowerCase()
      .includes(PRESENT_BACKGROUND);
    marks.set(`${match[1]}|${match[2]}`, green ? "present" : "absent");
  }

  const selected = doc.querySelector("select[name=grupp_pk] option[selected]");

  return {
    groupName: selected ? textOf(selected) : null,
    activities,
    members,
    marks,
  };
}

/**
 * The page names months but never years. Pages are merged in the order they
 * were saved, and a month that goes backwards is the turn of a year — which
 * is what a season running September to April looks like.
 */
export function assignYears(
  activities: ParsedActivity[],
  startYear: number
): { date: string; activity: ParsedActivity }[] {
  let year = startYear;
  let previous = 0;
  return activities.map((activity) => {
    if (previous && activity.month < previous) year += 1;
    previous = activity.month;
    const date = `${year}-${String(activity.month).padStart(2, "0")}-${String(
      activity.day
    ).padStart(2, "0")}`;
    return { date, activity };
  });
}

/** The year the group's own name starts with, when it has one. */
export function yearFromGroupName(groupName: string | null): number | null {
  const match = /\b(20\d{2})\b/.exec(groupName ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * Several saved pages into one season. Activities keep the order they were
 * given; a member or an activity seen twice is the same one, because both
 * carry SportAdmin's own id.
 */
export function mergePages(pages: ParsedPage[]): ParsedPage {
  const activities: ParsedActivity[] = [];
  const members: ParsedMember[] = [];
  const seenActivity = new Set<string>();
  const seenMember = new Set<string>();
  const marks = new Map<string, CellValue>();

  for (const page of pages) {
    for (const activity of page.activities) {
      if (seenActivity.has(activity.externalRef)) continue;
      seenActivity.add(activity.externalRef);
      activities.push(activity);
    }
    for (const member of page.members) {
      if (seenMember.has(member.externalRef)) continue;
      seenMember.add(member.externalRef);
      members.push(member);
    }
    for (const [key, value] of page.marks) marks.set(key, value);
  }

  return {
    groupName: pages.find((p) => p.groupName)?.groupName ?? null,
    activities,
    members,
    marks,
  };
}

/**
 * A merged season into what the preview takes. `marks` is keyed by the
 * activity's index in the returned array, so a cell nobody filled in simply
 * has no key — and unmarked never becomes a record (ADR-012's rate is
 * attended ÷ marked).
 */
export function toImportInput(
  page: ParsedPage,
  startYear: number
): { activities: ImportActivity[]; rows: ImportAttendanceRow[] } {
  const dated = assignYears(page.activities, startYear);

  const activities: ImportActivity[] = dated.map(({ date, activity }) => ({
    externalRef: activity.externalRef,
    date,
    time: activity.time,
    typeName: activity.typeName,
    title: null,
    confirmed: activity.confirmed,
    lokEligible: activity.lokEligible,
  }));

  const rows: ImportAttendanceRow[] = page.members.map((member, i) => {
    const marks: Record<string, string> = {};
    page.activities.forEach((activity, index) => {
      // An unconfirmed activity was never registered, so its whole column is
      // unmarked — not a column of absences.
      if (!activity.confirmed) return;
      const value = page.marks.get(
        `${activity.externalRef}|${member.externalRef}`
      );
      if (value) marks[String(index)] = value;
    });
    return {
      rowNumber: i + 1,
      firstName: member.firstName,
      lastName: member.lastName,
      externalRef: member.externalRef,
      marks,
    };
  });

  return { activities, rows };
}
