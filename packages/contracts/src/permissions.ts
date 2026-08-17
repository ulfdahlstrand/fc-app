/** The permission catalog (ADR-005, ADR-011). Fixed in code; which role holds which is data. */

import { z } from "zod";

export const PERMISSIONS = [
  "members.view",
  "members.manage",
  /**
   * Rewriting the roster from a file (#63). Separate from `members.manage`
   * because editing one member and replacing a hundred are not the same
   * authority; seeded to Admin only, but a club may grant it (ADR-005).
   */
  "members.import",
  "activities.manage",
  "attendance.record",
  /**
   * Backfilling a season of attendance from a file (#84). Separate from
   * `attendance.record` because marking today's training is something a coach
   * does forty times a season, and writing half a season of history in one
   * action is not the same authority; seeded to Admin only (ADR-005).
   */
  "attendance.import",
  "callups.manage",
  "callups.respond",
  "posts.manage",
  "tracking.manage",
  /**
   * Defining what a team measures about a player, and reading or recording
   * those measurements (#96). Gates the **reads** too, unlike the rest of the
   * roster: an assessment of a child is a coach's judgement, and holding
   * `members.view` is not the same as being entitled to read it (ADR-011).
   */
  "development.manage",
  "settings.team",
  "settings.club",
] as const;

export const permissionSchema = z.enum(PERMISSIONS);

export type Permission = z.infer<typeof permissionSchema>;

