import { describe, expect, it } from "vitest";
import {
  attendanceTemplate,
  parseAttendanceSheet,
  parseCsv,
  toImportInput,
  type SheetCell,
} from "./attendance-sheet";

const DEFAULTS = { time: "18:00", typeName: "Träning" };

function sheet(csv: string) {
  return parseAttendanceSheet(parseCsv(csv) as SheetCell[][], DEFAULTS);
}

describe("parseCsv", () => {
  it("takes the delimiter a Swedish spreadsheet used", () => {
    expect(parseCsv("a;b;c\n1;2;3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("falls back to commas when there are no semicolons", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a delimiter that is inside quotes", () => {
    expect(parseCsv('a;b\n"Berhane; Ghebre";2')).toEqual([
      ["a", "b"],
      ["Berhane; Ghebre", "2"],
    ]);
  });

  it("unescapes a doubled quote", () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([["a"], ['say "hi"']]);
  });

  it("drops the byte-order mark and blank lines", () => {
    expect(parseCsv("﻿a;b\n\n1;2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseAttendanceSheet", () => {
  it("fills time and type from the wizard when the header names only a date", () => {
    const { columns } = sheet(
      "Förnamn;Efternamn;2026-01-14\nTure;Dahlstrand;N",
    );
    expect(columns[0]).toMatchObject({
      date: "2026-01-14",
      time: "18:00",
      typeName: "Träning",
      title: null,
    });
  });

  it("reads the pipe fields positionally", () => {
    const { columns } = sheet(
      "Förnamn;2026-01-21 | 13:00 | Match | vs Skiljebo SK\nTure;N",
    );
    expect(columns[0]).toMatchObject({
      date: "2026-01-21",
      time: "13:00",
      typeName: "Match",
      title: "vs Skiljebo SK",
    });
  });

  it("keeps the default for a field left empty between pipes", () => {
    const { columns } = sheet("Förnamn;2026-01-21 | | Match\nTure;N");
    expect(columns[0]).toMatchObject({ time: "18:00", typeName: "Match" });
  });

  it("reports a header that is neither a date nor an identity column", () => {
    const parsed = sheet(
      "Förnamn;Personnummer;2026-01-14\nTure;20170314-2412;N",
    );
    expect(parsed.problems).toContainEqual({
      kind: "ignoredColumn",
      at: 2,
      detail: "Personnummer",
    });
    expect(parsed.columns).toHaveLength(1);
  });

  it("rejects a header whose clock is not a clock", () => {
    const parsed = sheet("Förnamn;2026-01-14 | halv sju\nTure;N");
    expect(parsed.columns).toEqual([]);
    expect(parsed.problems[0]?.kind).toBe("ignoredColumn");
  });

  it("writes nothing for a blank cell", () => {
    const parsed = sheet(
      "Förnamn;Efternamn;2026-01-14;2026-01-16\nTure;Dahlstrand;N;",
    );
    expect(parsed.rows[0]?.marks).toEqual({ "0": "N" });
  });

  it("collects the distinct values for the mapping step", () => {
    const parsed = sheet(
      "Förnamn;2026-01-14;2026-01-16;2026-01-21\nTure;N;F;N\nAlva;S;N;F",
    );
    expect(parsed.values).toEqual(["F", "N", "S"]);
  });

  it("carries Medlems Nr across without matching on it", () => {
    const parsed = sheet("Medlems Nr;Förnamn;2026-01-14\n4711;Ture;N");
    expect(parsed.rows[0]).toMatchObject({
      externalRef: "4711",
      firstName: "Ture",
    });
  });

  it("reports a row with no first name instead of importing it", () => {
    const parsed = sheet("Förnamn;Efternamn;2026-01-14\n;Dahlstrand;N");
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems).toContainEqual({
      kind: "namelessRow",
      at: 2,
      detail: "",
    });
  });

  it("says so when there is no Förnamn column at all", () => {
    const parsed = sheet("Namn;2026-01-14\nTure;N");
    expect(parsed.problems).toContainEqual({
      kind: "badHeader",
      at: 1,
      detail: "Förnamn",
    });
  });

  it("takes a date a spreadsheet reader handed over as a Date", () => {
    const grid: SheetCell[][] = [
      ["Förnamn", new Date(2026, 0, 14)],
      ["Ture", "N"],
    ];
    expect(parseAttendanceSheet(grid, DEFAULTS).columns[0]?.date).toBe(
      "2026-01-14",
    );
  });
});

describe("toImportInput", () => {
  it("produces the shape the planner already takes", () => {
    const { activities, rows } = toImportInput(
      sheet(
        "Förnamn;Efternamn;2026-01-14;2026-01-16 | | Match\nTure;Dahlstrand;N;F",
      ),
    );
    expect(activities).toEqual([
      {
        externalRef: null,
        date: "2026-01-14",
        time: "18:00",
        typeName: "Träning",
        title: null,
        confirmed: true,
        lokEligible: true,
      },
      {
        externalRef: null,
        date: "2026-01-16",
        time: "18:00",
        typeName: "Match",
        title: null,
        confirmed: true,
        lokEligible: true,
      },
    ]);
    expect(rows[0]).toEqual({
      rowNumber: 2,
      firstName: "Ture",
      lastName: "Dahlstrand",
      externalRef: null,
      marks: { "0": "N", "1": "F" },
    });
  });
});

describe("attendanceTemplate", () => {
  const template = attendanceTemplate(
    [
      { firstName: "Ture", lastName: "Dahlstrand" },
      { firstName: "Alva", lastName: "Berg" },
    ],
    [{ name: "Närvarande" }, { name: "Frånvarande" }],
  );

  it("carries the real roster, so the names cannot be mistyped", () => {
    expect(template).toContain("Ture;Dahlstrand");
    expect(template).toContain("Alva;Berg");
  });

  it("lists the team's own status names", () => {
    expect(template).toContain("Närvarande, Frånvarande");
  });

  it("survives a round trip: its own notes are not members", () => {
    const parsed = sheet(template);
    expect(parsed.rows.map((r) => r.firstName)).toEqual(["Ture", "Alva"]);
    expect(parsed.problems.filter((p) => p.kind !== "ignoredColumn")).toEqual(
      [],
    );
  });

  it("creates no activity from an example column left as it came", () => {
    const parsed = sheet(template);
    expect(parsed.columns).toEqual([]);
    expect(parsed.problems.map((p) => p.kind)).toEqual([
      "ignoredColumn",
      "ignoredColumn",
    ]);
  });
});
