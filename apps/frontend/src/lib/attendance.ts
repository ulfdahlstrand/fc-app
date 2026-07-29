/**
 * Attendance records (issue #14) — the screen Kit was designed for.
 *
 * Reading needs members.view; recording needs attendance.record. Writing is a
 * bulk save: the coach marks the roster standing at the side of the pitch and
 * saves once, rather than firing a request per tap on a connection that may
 * not be there.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ActivityColour, AttendanceStatus } from "@fc-app/contracts";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { orpcQuery } from "./orpc-query";

/** What a member is marked as, or `null` for not decided yet. */
export type Marks = Record<string, string | null>;

export function attendanceQueryOptions(teamId: string, activityId: string) {
  return orpcQuery.listAttendance.queryOptions({
    input: { teamId, activityId },
  });
}

export function useAttendance(teamId: string, activityId: string) {
  return useQuery(attendanceQueryOptions(teamId, activityId));
}

export function useSetAttendance(teamId: string, activityId: string) {
  return useMutation({
    mutationFn: (entries: { memberId: string; statusId: string | null }[]) =>
      orpc.setAttendance({ teamId, activityId, entries }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpcQuery.listAttendance.key({
          input: { teamId, activityId },
        }),
      });
    },
  });
}

// --- Kit's tap toggle, generalised over configurable statuses --------------
//
// The source design has four fixed states — present, absent, late, unset. A
// team defines its own, so the treatment follows the status's Kit colour
// token instead: green fills solid (it is the brand *and* means present),
// orange and amber tint, and unmarked is a dashed ring, because in Kit dashed
// always means "not decided yet".
//
// Classes are a static lookup rather than interpolated names so Tailwind can
// see every one of them at build time.

/**
 * Every marked status fills solid, where Kit's source fills only the green one
 * and tints the rest. The tinted variants exist because Kit's phone row is
 * white; ours also tints the row on the wide layout, and a tinted toggle on a
 * tinted row of the same colour disappears. Kit already reserves full-strength
 * fills for "hero, active nav, tap toggle", so this stays inside the rule.
 */
export const ATTENDANCE_TOGGLE: Record<ActivityColour, string> = {
  green: "bg-brand text-white",
  ink: "bg-ink text-white",
  orange: "bg-[var(--orange-500)] text-white",
  amber: "bg-[var(--amber-500)] text-white",
  neutral: "bg-[var(--neutral-450)] text-white",
};

/** The unmarked toggle: the only dashed ring in the app, plus a "?". */
export const ATTENDANCE_TOGGLE_UNMARKED =
  "border-2 border-dashed border-[var(--border-dashed)] text-[var(--neutral-500)]";

/**
 * Row tint, wide layout only. Kit tints the whole desktop row but keeps the
 * phone row white — state lives in the disc and the toggle there, "so the list
 * stays readable in sunlight". Hence the `md:` prefixes: the base row is white
 * at every width and only the wide grid picks up the tint.
 */
export const ATTENDANCE_ROW_TINT: Record<ActivityColour, string> = {
  green: "md:bg-surface-present",
  ink: "md:bg-[var(--neutral-150)]",
  orange: "md:bg-surface-absent",
  amber: "md:bg-surface-late",
  neutral: "md:bg-[var(--neutral-100)]",
};

/** Avatar disc tint per status — the phone row's carrier of state. */
export const ATTENDANCE_AVATAR: Record<ActivityColour, string> = {
  green: "bg-brand text-white",
  ink: "bg-ink text-white",
  orange: "bg-[var(--orange-500)] text-white",
  amber: "bg-[var(--amber-500)] text-white",
  neutral: "bg-[var(--neutral-150)] text-[var(--neutral-650)]",
};

/**
 * Kit is nearly icon-free: state is carried by colour and a glyph from its
 * own small alphabet (✓ ✕ ? and letters). Green takes the one drawn icon,
 * orange takes the ✕, and anything else takes the status's initial.
 */
export function statusGlyph(status: AttendanceStatus): string {
  if (status.colour === "green") return "✓";
  if (status.colour === "orange") return "✕";
  return status.name.charAt(0).toUpperCase();
}

/**
 * Tapping cycles unmarked → each status in order → unmarked. With three
 * statuses that is four taps back to the start, which is what makes marking a
 * roster of twenty a job of seconds rather than a form.
 */
export function nextMark(
  current: string | null,
  statuses: AttendanceStatus[]
): string | null {
  if (statuses.length === 0) return null;
  if (current === null) return statuses[0]?.id ?? null;
  const index = statuses.findIndex((status) => status.id === current);
  // An archived status is not in the cycle; tapping it starts over.
  if (index === -1) return statuses[0]?.id ?? null;
  return statuses[index + 1]?.id ?? null;
}

/** Only the members whose mark differs from what is stored need saving. */
export function changedEntries(
  marks: Marks,
  saved: Marks
): { memberId: string; statusId: string | null }[] {
  return Object.entries(marks)
    .filter(([memberId, statusId]) => (saved[memberId] ?? null) !== statusId)
    .map(([memberId, statusId]) => ({ memberId, statusId }));
}
