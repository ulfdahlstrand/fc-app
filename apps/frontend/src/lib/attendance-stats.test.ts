/**
 * CSV export and the at-risk rule (issue #15).
 *
 * "Well-formed CSV" is an acceptance criterion, and the field most likely to
 * break it is a Swedish name with a comma in it — which is exactly what the
 * export writes ("Bergström, Alva").
 */
import { describe, expect, it } from "vitest";
import type { MemberAttendanceStats } from "@fc-app/contracts";
import { isAtRisk, statsToCsv, toCsv } from "./attendance-stats";

const headers = {
  name: "Name",
  attended: "Attended",
  marked: "Marked",
  rate: "Rate %",
};

function member(
  firstName: string,
  lastName: string,
  attended: number,
  marked: number,
  rate: number | null,
): MemberAttendanceStats {
  return { memberId: lastName, firstName, lastName, attended, marked, rate };
}

describe("toCsv", () => {
  it("separates with commas and terminates rows with CRLF", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d");
  });

  it("quotes a field containing a comma", () => {
    expect(toCsv([["Bergström, Alva"]])).toBe('"Bergström, Alva"');
  });

  it("doubles quotes inside a quoted field", () => {
    expect(toCsv([['He said "hi"']])).toBe('"He said ""hi"""');
  });

  it("quotes a field containing a newline", () => {
    expect(toCsv([["two\nlines"]])).toBe('"two\nlines"');
  });

  it("leaves an ordinary field alone", () => {
    expect(toCsv([["Alva", "94"]])).toBe("Alva,94");
  });
});

describe("statsToCsv", () => {
  it("writes a header row and one row per member, names quoted", () => {
    const csv = statsToCsv(
      [
        member("Alva", "Bergström", 15, 16, 94),
        member("Otto", "Persson", 0, 0, null),
      ],
      headers,
    );

    expect(csv.split("\r\n")).toEqual([
      "Name,Attended,Marked,Rate %",
      '"Bergström, Alva",15,16,94',
      '"Persson, Otto",0,0,',
    ]);
  });

  it("leaves the rate blank rather than writing a misleading zero", () => {
    const csv = statsToCsv([member("Otto", "Persson", 0, 0, null)], headers);

    expect(csv.endsWith(",0,0,")).toBe(true);
  });
});

describe("isAtRisk", () => {
  it("flags a low rate once there is enough marked to mean something", () => {
    expect(isAtRisk(member("Hugo", "Lindqvist", 6, 10, 60))).toBe(true);
  });

  it("does not flag someone marked only once or twice", () => {
    // 0 of 2 is a bad week, not a pattern worth a phone call.
    expect(isAtRisk(member("Hugo", "Lindqvist", 0, 2, 0))).toBe(false);
  });

  it("does not flag a healthy rate, or someone with no rate at all", () => {
    expect(isAtRisk(member("Alva", "Bergström", 15, 16, 94))).toBe(false);
    expect(isAtRisk(member("Otto", "Persson", 0, 0, null))).toBe(false);
  });
});
