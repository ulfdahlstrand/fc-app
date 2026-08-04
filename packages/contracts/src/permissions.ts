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
  "callups.manage",
  "callups.respond",
  "posts.manage",
  "tracking.manage",
  "settings.team",
  "settings.club",
] as const;

export const permissionSchema = z.enum(PERMISSIONS);

export type Permission = z.infer<typeof permissionSchema>;

