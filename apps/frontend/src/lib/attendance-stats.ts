/** Attendance statistics (issue #15). */
import { useQuery } from "@tanstack/react-query";
import type { MemberAttendanceStats } from "@fc-app/contracts";
import { orpcQuery } from "./orpc-query";

export interface StatsFilters {
  from?: string;
  to?: string;
  seasonId?: string;
  activityTypeId?: string;
  groupId?: string;
}

export function attendanceStatsQueryOptions(
  teamId: string,
  filters: StatsFilters = {},
) {
  // Only send the filters that are set — the API rejects blank ones.
  return orpcQuery.attendanceStats.queryOptions({
    input: {
      teamId,
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      ...(filters.seasonId ? { seasonId: filters.seasonId } : {}),
      ...(filters.activityTypeId
        ? { activityTypeId: filters.activityTypeId }
        : {}),
      ...(filters.groupId ? { groupId: filters.groupId } : {}),
    },
  });
}

export function useAttendanceStats(teamId: string, filters: StatsFilters = {}) {
  return useQuery(attendanceStatsQueryOptions(teamId, filters));
}

export function useMemberAttendance(teamId: string, memberId: string) {
  return useQuery(
    orpcQuery.memberAttendance.queryOptions({ input: { teamId, memberId } }),
  );
}

/**
 * The at-risk line lives in the contract: the dashboard (#20) counts these
 * server-side, and a threshold that differed between the two would put a
 * number on the dashboard that this page disagrees with.
 */
export { AT_RISK_RATE, isAtRisk } from "@fc-app/contracts";

// --- CSV export -----------------------------------------------------------

/**
 * One field, escaped per RFC 4180: quote anything containing a comma, a quote
 * or a newline, and double the quotes inside.
 */
function escapeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Rows to RFC 4180 text: comma-separated, CRLF-terminated. */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeField).join(",")).join("\r\n");
}

/** The statistics table as CSV, in the order it is on screen. */
export function statsToCsv(
  members: MemberAttendanceStats[],
  headers: { name: string; attended: string; marked: string; rate: string },
): string {
  return toCsv([
    [headers.name, headers.attended, headers.marked, headers.rate],
    ...members.map((member) => [
      `${member.lastName}, ${member.firstName}`,
      String(member.attended),
      String(member.marked),
      member.rate === null ? "" : String(member.rate),
    ]),
  ]);
}

/** Hands the file to the browser. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
