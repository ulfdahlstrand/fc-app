import { z } from "zod";

// Permission catalog (ADR-005)
//
// The catalog is fixed in code — adding a permission is a code change — while
// which permissions a role has is club-configurable data. Shared here so the
// frontend can gate UI on the same identifiers the backend enforces.
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  "members.view",
  "members.manage",
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

// ---------------------------------------------------------------------------
