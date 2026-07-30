/** Dashboard (issue #20). */
import { useQuery } from "@tanstack/react-query";
import type { DashboardAttendance } from "@fc-app/contracts";
import { orpcQuery } from "./orpc-query";

export function dashboardQueryOptions(teamId: string) {
  return orpcQuery.dashboard.queryOptions({ input: { teamId } });
}

export function useDashboard(teamId: string) {
  return useQuery(dashboardQueryOptions(teamId));
}

/**
 * The change since the previous window, in whole percentage points, or null
 * when there is nothing honest to compare against.
 *
 * A team with no marks last month has not "improved by 80 points"; it has no
 * trend at all, and saying otherwise would be the dashboard's first lie.
 */
export function attendanceDelta(
  attendance: Pick<DashboardAttendance, "rate" | "previousRate">,
): number | null {
  if (attendance.rate === null || attendance.previousRate === null) return null;
  return attendance.rate - attendance.previousRate;
}
