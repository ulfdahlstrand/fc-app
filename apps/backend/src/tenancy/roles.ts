/** The default roles seeded on club creation (ADR-005). */
import type { Permission } from "@fc-app/contracts";
import { PERMISSIONS } from "@fc-app/contracts";

export const ADMIN_SYSTEM_KEY = "admin";

export interface DefaultRole {
  systemKey: string;
  name: string;
  permissions: Permission[];
}

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    systemKey: "admin",
    name: "Admin",
    permissions: [...PERMISSIONS],
  },
  {
    systemKey: "coach",
    name: "Coach",
    permissions: [
      "members.view",
      "members.manage",
      "activities.manage",
      "attendance.record",
      "callups.manage",
      "posts.manage",
      "tracking.manage",
      "settings.team",
    ],
  },
  {
    systemKey: "player",
    name: "Player",
    permissions: ["callups.respond"],
  },
  {
    systemKey: "guardian",
    name: "Guardian",
    permissions: ["callups.respond"],
  },
];
