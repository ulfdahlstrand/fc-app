// @vitest-environment happy-dom
/**
 * The fixture is synthetic, but every shape in it was taken from a real saved
 * page: the month row's colspan, the day row's `id="aNNN"`, the title on the
 * `<td>` for an ordinary column and on an inner `<span>` for a non-LOK one,
 * `aktivitetOFF_pk` marking a confirmed activity, the leading dash on someone
 * who has left the group, and the `aOn(a…,m…)` handler on every cell of the
 * grid.
 */
import { describe, expect, it } from "vitest";
import {
  parseAttendanceSheet,
  parseCsv,
  toImportInput as sheetToImportInput,
  type SheetCell,
} from "./attendance-sheet";
import {
  assignYears,
  mergePages,
  parseAttendancePage,
  toImportInput,
  yearFromGroupName,
  type ParsedActivity,
} from "./sportadmin-attendance";

function dayCell(ref: string, day: number): string {
  return `<td align="center" style="background:#CCFFCC" class="kort3" id="a${ref}"><a href="javascript:void(0)" onclick="goToAliasX('calling_edit?legacyActivityId=${ref}')">${day}</a></td>`;
}

function timeCell(type: string, hh: string, mm: string, lok = true): string {
  const clock = `<font style="color:#666666;font-size:8px">${hh}<sup>${mm}</sup></font>`;
  return lok
    ? `<td align="center" bgcolor="CCFFCC" title="${type}" class="kort5">${clock}</td>`
    : `<td align="center" bgcolor="D9EDF7" class="kort5"><font style="color:#666666;font-size:8px"><span title="${type}">${clock}</span></font></td>`;
}

function confirmCell(ref: string, isConfirmed: boolean): string {
  const field = isConfirmed ? "aktivitetOFF_pk" : "aktivitetON_pk";
  return `<td align="center" class="kort3" bgcolor="CCFFCC"><input type="checkbox" class="check" onclick="if (confirm('Är du säker?')) {${field}.value=${ref};submit();} else this.checked=true"></td>`;
}

function nameCell(
  ref: string,
  name: string,
  year: string,
  current = true,
): string {
  // A former member keeps their profile link; SportAdmin marks them with a
  // leading dash instead, and renders the name without the inner <font>.
  const label = current
    ? `<font style="color:#904040">${name}</font>`
    : `<b>-</b> ${name}`;
  const inner = `<font style="color:#AAAAAA"><a href="#" onclick="showProfileCard(${ref});">${label}</a></font>`;
  return `<tr><td style="background:#FFF" nowrap id="m${ref}"><div style="float:right"><font style="color:#AAAAAA"> ${year}&nbsp;</font></div>${inner}</td></tr>`;
}

function gridCell(
  activityRef: string,
  memberRef: string,
  present: boolean,
): string {
  const style = present ? "background:#CCFFCC;height:20px" : "height:20px";
  const body = present ? '<font color="999999">&nbsp;</font>' : "&nbsp;";
  return `<td align="center" style="${style}" class="kort3" onmouseover="aOn(a${activityRef},m${memberRef},this)" onmouseout="aOff(a${activityRef},m${memberRef},this)">${body}</td>`;
}

/**
 * Four columns: a training, a match, a non-LOK match, and one nobody has
 * confirmed yet. Three members, one of whom has left the team.
 */
const ACTIVITY_REFS = ["100", "101", "102", "103"];
const MEMBERS = [
  { ref: "900", name: "Adam Görling", year: "2017" },
  { ref: "901", name: "Alexander Eklund-Morén", year: "2017" },
];

function page(): string {
  const attendance: Record<string, boolean[]> = {
    // 100  101    102    103 (unconfirmed — its column is never registered)
    "900": [true, false, true, false],
    "901": [false, true, false, true],
  };
  return `<html><body>
    <select name="grupp_pk"><option value="1" selected>2026 Fotboll - P 17:4 (135)</option></select>
    <table>
      <tr>
        <td align="center" bgcolor="FFFFFF" class="kort4" colspan="2">Mars</td>
        <td align="center" bgcolor="FFFFFF" class="kort4" colspan="2">April</td>
      </tr>
      <tr>${dayCell("100", 24)}${dayCell("101", 28)}${dayCell("102", 2)}${dayCell("103", 7)}</tr>
      <tr>
        ${timeCell("Träning", "17", "00")}
        ${timeCell("Tävling", "09", "35")}
        ${timeCell("Tävling", "14", "00", false)}
        ${timeCell("Träning", "18", "00")}
      </tr>
      <tr>
        ${confirmCell("100", true)}${confirmCell("101", true)}
        ${confirmCell("102", true)}${confirmCell("103", false)}
      </tr>
    </table>
    <table>
      ${nameCell("900", "Adam Görling", "2017")}
      ${nameCell("901", "Alexander Eklund-Morén", "2017")}
      ${nameCell("902", "Leo Jokhadar", "2018", false)}
    </table>
    <table>
      ${MEMBERS.map(
        (m) =>
          `<tr>${ACTIVITY_REFS.map((a, i) =>
            gridCell(a, m.ref, attendance[m.ref]![i]!),
          ).join("")}</tr>`,
      ).join("")}
    </table>
  </body></html>`;
}

describe("parseAttendancePage", () => {
  it("reads the type from the markup, never from the time of day", () => {
    const { activities } = parseAttendancePage(page());
    expect(activities.map((a) => a.typeName)).toEqual([
      "Träning",
      "Tävling",
      "Tävling",
      "Träning",
    ]);
    // 14:00 on a weekday would look like a training to any clock-based rule.
    expect(activities[2]?.typeName).toBe("Tävling");
  });

  it("keeps a non-LOK column, marking it rather than dropping it", () => {
    const { activities } = parseAttendancePage(page());
    expect(activities.map((a) => a.lokEligible)).toEqual([
      true,
      true,
      false,
      true,
    ]);
  });

  it("marks an activity confirmed only when it can be un-confirmed", () => {
    const { activities } = parseAttendancePage(page());
    expect(activities.map((a) => a.confirmed)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("reads months through their colspan", () => {
    const { activities } = parseAttendancePage(page());
    expect(activities.map((a) => [a.month, a.day])).toEqual([
      [3, 24],
      [3, 28],
      [4, 2],
      [4, 7],
    ]);
  });

  it("marks a former member by their leading dash and strips it", () => {
    const { members } = parseAttendancePage(page());
    expect(members.map((m) => m.externalRef)).toEqual(["900", "901", "902"]);
    expect(members.map((m) => m.former)).toEqual([false, false, true]);
    expect(members[2]).toMatchObject({
      firstName: "Leo",
      lastName: "Jokhadar",
      birthYear: "2018",
    });
  });

  it("splits a multi-word surname on the first space only", () => {
    const { members } = parseAttendancePage(page());
    expect(members[1]).toMatchObject({
      firstName: "Alexander",
      lastName: "Eklund-Morén",
    });
  });

  it("keys every mark by the ids the cell carries", () => {
    const { marks } = parseAttendancePage(page());
    expect(marks.get("100|900")).toBe("present");
    expect(marks.get("100|901")).toBe("absent");
    expect(marks.get("102|900")).toBe("present");
  });

  it("throws rather than shifting a season when the header does not line up", () => {
    const broken = page().replace(dayCell("103", 7), "");
    expect(() => parseAttendancePage(broken)).toThrow(/does not line up/);
  });

  it("reads the group name for the year suggestion", () => {
    expect(yearFromGroupName(parseAttendancePage(page()).groupName)).toBe(2026);
  });
});

describe("toImportInput", () => {
  it("writes no mark at all for an unconfirmed column", () => {
    const { activities, rows } = toImportInput(
      parseAttendancePage(page()),
      2026,
    );
    expect(activities[3]?.confirmed).toBe(false);
    for (const row of rows) expect(row.marks["3"]).toBeUndefined();
  });

  it("carries absence from a confirmed column", () => {
    const { rows } = toImportInput(parseAttendancePage(page()), 2026);
    expect(rows[0]?.marks).toEqual({
      "0": "present",
      "1": "absent",
      "2": "present",
    });
    expect(rows[1]?.marks).toEqual({
      "0": "absent",
      "1": "present",
      "2": "absent",
    });
  });

  it("dates the columns from the chosen year", () => {
    const { activities } = toImportInput(parseAttendancePage(page()), 2026);
    expect(activities.map((a) => a.date)).toEqual([
      "2026-03-24",
      "2026-03-28",
      "2026-04-02",
      "2026-04-07",
    ]);
  });
});

describe("assignYears", () => {
  const at = (month: number, day: number): ParsedActivity => ({
    externalRef: `${month}${day}`,
    month,
    day,
    time: "18:00",
    typeName: "Träning",
    confirmed: true,
    lokEligible: true,
  });

  it("rolls the year over when the months go backwards", () => {
    const dated = assignYears([at(11, 3), at(12, 1), at(1, 9), at(2, 4)], 2025);
    expect(dated.map((d) => d.date)).toEqual([
      "2025-11-03",
      "2025-12-01",
      "2026-01-09",
      "2026-02-04",
    ]);
  });

  it("leaves a season inside one year alone", () => {
    const dated = assignYears([at(1, 9), at(6, 2), at(8, 4)], 2026);
    expect(dated.map((d) => d.date)).toEqual([
      "2026-01-09",
      "2026-06-02",
      "2026-08-04",
    ]);
  });
});

describe("mergePages", () => {
  it("takes an activity and a member seen on two pages once", () => {
    const one = parseAttendancePage(page());
    const merged = mergePages([one, one]);
    expect(merged.activities).toHaveLength(4);
    expect(merged.members).toHaveLength(3);
    expect(merged.marks.size).toBe(8);
  });
});

describe("the two sources agree", () => {
  /**
   * #86's matrix and #84's page are different files describing the same
   * season. They meet at the wire rows, and everything downstream — the
   * planner, the preview, the commit — only ever sees those. If the two
   * disagree here, the backend has quietly learned a second format.
   */
  it("describes the same season the same way", () => {
    const fromPage = toImportInput(parseAttendancePage(page()), 2026);
    const fromSheet = sheetToImportInput(
      parseAttendanceSheet(
        parseCsv(
          [
            "Förnamn;Efternamn;2026-03-24 | 17:00 | Träning;2026-03-28 | 09:35 | Tävling;2026-04-02 | 14:00 | Tävling",
            "Adam;Görling;N;F;N",
            "Alexander;Eklund-Morén;F;N;F",
          ].join("\n"),
        ) as SheetCell[][],
        { time: "18:00", typeName: "Träning" },
      ),
    );

    // The unconfirmed fourth column is absent from the sheet on purpose: a
    // column somebody typed exists because they typed it.
    expect(
      fromSheet.activities.map((a) => [a.date, a.time, a.typeName]),
    ).toEqual(
      fromPage.activities
        .filter((a) => a.confirmed)
        .map((a) => [a.date, a.time, a.typeName]),
    );

    expect(fromSheet.rows.map((r) => [r.firstName, r.lastName])).toEqual(
      fromPage.rows
        .filter((r) => r.firstName !== "Leo")
        .map((r) => [r.firstName, r.lastName]),
    );
    // Same cells filled in, whatever the two files call the values.
    expect(fromSheet.rows.map((r) => Object.keys(r.marks))).toEqual(
      fromPage.rows
        .filter((r) => r.firstName !== "Leo")
        .map((r) => Object.keys(r.marks)),
    );
  });
});
