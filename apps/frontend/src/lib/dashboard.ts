/**
 * Dashboard (issue #20).
 *
 * One query for the whole page. Every widget arrives together, so the landing
 * page never renders a stack of independently-loading boxes — which is what
 * asking each feature's own endpoint would have produced.
 *
 * A null widget means the caller may not see it; an empty one means there is
 * nothing there yet. See `dashboardOutputSchema` for why the two differ.
 */
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
