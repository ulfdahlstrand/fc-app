import { z } from "zod";

import { myCallupSchema } from "./callups.js";
import { isoInstantSchema } from "./common.js";
import { activityColourSchema } from "./groups.js";

// Dashboard (issue #20)
//
// The landing page inside a team context. It aggregates features that already
// have their own pages, so it is deliberately **one** procedure rather than
// four: the page must load in a single round of queries, and four calls that
// each re-derive the caller's membership is how a landing page gets slow.
//
// Every widget is nullable, and null and empty mean different things:
//
//   - `null`  — the caller may not see this. The widget is not rendered.
//   - `[]`/0  — the caller may see it and there is nothing there yet. The
//               widget renders its empty state.
//
// That distinction is what lets a player and a coach share one page without
// the player being shown an empty coach's dashboard.
// ---------------------------------------------------------------------------

/** One activity in the "what's next" widget, with its type already resolved. */
export const dashboardActivitySchema = z.object({
  id: z.string(),
  startsAt: isoInstantSchema,
  endsAt: isoInstantSchema.nullable(),
  title: z.string().nullable(),
  location: z.string().nullable(),
  cancelled: z.boolean(),
  activityTypeId: z.string(),
  /**
   * Denormalised onto the activity so the dashboard stays a single request.
   * Everywhere else the frontend joins these client-side from a cached list.
   */
  activityTypeName: z.string(),
  activityTypeColour: activityColourSchema,
  /** null when there is no squad yet, or the squad is still a draft. */
  callup: z
    .object({
      squad: z.number().int(),
      accepted: z.number().int(),
      declined: z.number().int(),
      pending: z.number().int(),
    })
    .nullable(),
});

export type DashboardActivity = z.infer<typeof dashboardActivitySchema>;

/**
 * The attendance widget: a rate, and the same rate over the window before it.
 * A single percentage is a fact; two of them are a trend, which is the thing a
 * coach actually acts on.
 */
export const dashboardAttendanceSchema = z.object({
  /** The window both rates are measured over. */
  windowDays: z.number().int(),
  /** null when nothing is marked in the window — no rate can be stated. */
  rate: z.number().nullable(),
  /** The window immediately before, for comparison. null when it was empty. */
  previousRate: z.number().nullable(),
  /** Activities held in the window, cancelled ones excluded. */
  activities: z.number().int(),
  /** Attendance marks made in the window — the denominator of `rate`. */
  marked: z.number().int(),
  /** Members below the at-risk line, counted with `isAtRisk`. */
  atRisk: z.number().int(),
});

export type DashboardAttendance = z.infer<typeof dashboardAttendanceSchema>;

/**
 * One tracking list (#19) with something still outstanding.
 *
 * Only `done` definitions appear: a date or a note column is information, not a
 * box to tick, so a blank one is not work anybody is failing to do.
 */
export const dashboardTrackingListSchema = z.object({
  definitionId: z.string(),
  name: z.string(),
  /** Members with the box ticked. */
  done: z.number().int(),
  /** Members in the roster — the denominator. */
  total: z.number().int(),
});

export const dashboardTrackingSchema = z.object({
  /** Incomplete lists only, most outstanding first. Empty means all ticked. */
  lists: z.array(dashboardTrackingListSchema),
});

export type DashboardTrackingList = z.infer<typeof dashboardTrackingListSchema>;

export const dashboardInputSchema = z.object({
  teamId: z.string(),
});

export const dashboardOutputSchema = z.object({
  /**
   * What *this* user has been asked and has not answered, for the members they
   * are linked to (#9) in this team. Never null: it needs no permission, only
   * a link, and it is the whole dashboard for most parents.
   */
  myPendingCallups: z.array(myCallupSchema),
  /** The next few activities. null without `members.view`. */
  upcoming: z.array(dashboardActivitySchema).nullable(),
  /**
   * Unanswered invitations across the team's published, upcoming squads.
   * null without `members.view`. Drafts are excluded — a squad nobody has been
   * told about is not a question anyone is failing to answer.
   */
  callupsPending: z.number().int().nullable(),
  /** null without `members.view`. */
  attendance: dashboardAttendanceSchema.nullable(),
  /** Tracking lists (#19) with ticks outstanding. null without `members.view`. */
  tracking: dashboardTrackingSchema.nullable(),
});

// ---------------------------------------------------------------------------
