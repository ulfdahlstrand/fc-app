import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAttendanceSheet, parseCsv, toImportInput, type SheetCell } from "./attendance-sheet";

describe("Ulfs fil", () => {
  it("parsar", () => {
    const csv = readFileSync("/tmp/narvaro-check.csv", "utf8");
    const parsed = parseAttendanceSheet(parseCsv(csv) as SheetCell[][], { time: "18:00", typeName: "Träning" });
    const types: Record<string, number> = {};
    for (const c of parsed.columns) types[c.typeName] = (types[c.typeName] ?? 0) + 1;
    console.log("kolumner:", parsed.columns.length, types);
    console.log("rader:", parsed.rows.length);
    console.log("värden:", parsed.values);
    console.log("problem:", parsed.problems);
    const { rows } = toImportInput(parsed);
    const marks = rows.reduce((n, r) => n + Object.keys(r.marks).length, 0);
    console.log("markeringar:", marks, "av", parsed.columns.length * parsed.rows.length);
    console.log("N totalt:", rows.reduce((n, r) => n + Object.values(r.marks).filter(v => v === "N").length, 0));
    console.log("dubbletter i tid:", (() => {
      const seen = new Map<string, number>();
      for (const c of parsed.columns) { const k = `${c.date} ${c.time} ${c.typeName}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
      return [...seen].filter(([, n]) => n > 1);
    })());
    console.log("namn med punkt:", parsed.rows.filter(r => r.lastName.includes("..")).map(r => `${r.firstName} ${r.lastName}`));
    expect(parsed.columns.length).toBeGreaterThan(0);
  });
});
