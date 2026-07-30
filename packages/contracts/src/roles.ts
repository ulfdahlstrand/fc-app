/** Roles: named permission sets per club (ADR-005). */

import { z } from "zod";
import { permissionSchema } from "./permissions.js";

export const roleSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  name: z.string(),
  /** Set for seeded roles (admin | coach | player | guardian); null for custom roles. */
  systemKey: z.string().nullable(),
  permissions: z.array(permissionSchema),
  /** Number of memberships currently using the role. */
  memberCount: z.number(),
});

export type Role = z.infer<typeof roleSchema>;

export const listRolesInputSchema = z.object({
  clubId: z.string(),
});

export const listRolesOutputSchema = z.object({
  roles: z.array(roleSchema),
});

export const createRoleInputSchema = z.object({
  clubId: z.string(),
  name: z.string().min(1).max(50),
  permissions: z.array(permissionSchema),
});

export const createRoleOutputSchema = z.object({
  role: roleSchema,
});

export const updateRoleInputSchema = z.object({
  clubId: z.string(),
  roleId: z.string(),
  name: z.string().min(1).max(50).optional(),
  permissions: z.array(permissionSchema).optional(),
});

export const updateRoleOutputSchema = z.object({
  role: roleSchema,
});

export const deleteRoleInputSchema = z.object({
  clubId: z.string(),
  roleId: z.string(),
});

export const deleteRoleOutputSchema = z.object({
  deleted: z.literal(true),
});

