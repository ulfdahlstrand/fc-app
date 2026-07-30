import { z } from "zod";

import { queryBooleanSchema } from "./common.js";

// Members — Zod schemas (issue #7)
//
// A member is a roster person (usually a player), scoped to one team, distinct
// from a user account. Core fields are kept minimal; team-specific fields come
// via custom field definitions (#8). Members are archived, never hard-deleted.
// ---------------------------------------------------------------------------

export const memberSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  birthYear: z.number().int().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  archived: z.boolean(),
  /** Custom field values keyed by field-definition id (#8), raw string form. */
  customFields: z.record(z.string(), z.string()),
});

export type Member = z.infer<typeof memberSchema>;

// ---------------------------------------------------------------------------
// Custom member fields (issue #8, ADR-005)
//
// Teams define their own typed member fields; values are stored per member.
// The catalog of field *types* is fixed in code; which fields exist is data.
// ---------------------------------------------------------------------------

export const memberFieldTypeSchema = z.enum([
  "text",
  "number",
  "date",
  "boolean",
  "select",
]);

export type MemberFieldType = z.infer<typeof memberFieldTypeSchema>;

export const memberFieldDefinitionSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  fieldType: memberFieldTypeSchema,
  /** Allowed values for a "select" field; empty for other types. */
  options: z.array(z.string()),
  required: z.boolean(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
});

export type MemberFieldDefinition = z.infer<
  typeof memberFieldDefinitionSchema
>;

/**
 * Validates and normalizes a raw value against a field definition. Returns the
 * canonical string to store, or an error message. Shared by the backend
 * (enforcement) and the frontend (inline feedback) so the rules never drift.
 */
export function validateMemberFieldValue(
  field: Pick<MemberFieldDefinition, "fieldType" | "options">,
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  switch (field.fieldType) {
    case "text":
      return { ok: true, value: raw };
    case "number": {
      if (trimmed === "" || !Number.isFinite(Number(trimmed))) {
        return { ok: false, error: "Not a valid number" };
      }
      return { ok: true, value: String(Number(trimmed)) };
    }
    case "date": {
      // Expect YYYY-MM-DD; reject anything Date can't parse to that shape.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return { ok: false, error: "Expected a date (YYYY-MM-DD)" };
      }
      const parsed = new Date(`${trimmed}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, error: "Not a valid date" };
      }
      return { ok: true, value: trimmed };
    }
    case "boolean": {
      if (trimmed !== "true" && trimmed !== "false") {
        return { ok: false, error: "Expected true or false" };
      }
      return { ok: true, value: trimmed };
    }
    case "select": {
      if (!field.options.includes(trimmed)) {
        return { ok: false, error: "Not an allowed option" };
      }
      return { ok: true, value: trimmed };
    }
  }
}

const MIN_BIRTH_YEAR = 1900;
const MAX_BIRTH_YEAR = 2100;

/**
 * Fields accepted when creating or updating a member. Exported so the frontend
 * can derive its form validation from the same rules the API enforces (ADR-007)
 * instead of restating them.
 */
export const memberWriteFields = {
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  birthYear: z.number().int().min(MIN_BIRTH_YEAR).max(MAX_BIRTH_YEAR).nullable(),
  email: z.string().email().max(255).nullable(),
  phone: z.string().max(50).nullable(),
};

export const listMembersInputSchema = z.object({
  teamId: z.string(),
  includeArchived: queryBooleanSchema.optional(),
  search: z.string().optional(),
  /** Filter to members belonging to this group (#10). */
  groupId: z.string().optional(),
});

export const listMembersOutputSchema = z.object({
  members: z.array(memberSchema),
});

export const getMemberInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
});

export const getMemberOutputSchema = z.object({
  member: memberSchema,
});

export const createMemberInputSchema = z.object({
  teamId: z.string(),
  firstName: memberWriteFields.firstName,
  lastName: memberWriteFields.lastName,
  birthYear: memberWriteFields.birthYear.optional(),
  email: memberWriteFields.email.optional(),
  phone: memberWriteFields.phone.optional(),
});

export const createMemberOutputSchema = z.object({
  member: memberSchema,
});

export const updateMemberInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
  firstName: memberWriteFields.firstName.optional(),
  lastName: memberWriteFields.lastName.optional(),
  birthYear: memberWriteFields.birthYear.optional(),
  email: memberWriteFields.email.optional(),
  phone: memberWriteFields.phone.optional(),
});

export const updateMemberOutputSchema = z.object({
  member: memberSchema,
});

export const setMemberArchivedInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
  archived: z.boolean(),
});

export const setMemberArchivedOutputSchema = z.object({
  member: memberSchema,
});

// Custom member field definitions & values (#8)

export const listMemberFieldsInputSchema = z.object({
  teamId: z.string(),
  includeArchived: queryBooleanSchema.optional(),
});

export const listMemberFieldsOutputSchema = z.object({
  fields: z.array(memberFieldDefinitionSchema),
});

export const createMemberFieldInputSchema = z.object({
  teamId: z.string(),
  name: z.string().min(1).max(100),
  fieldType: memberFieldTypeSchema,
  options: z.array(z.string().min(1).max(100)).max(50).optional(),
  required: z.boolean().optional(),
});

export const createMemberFieldOutputSchema = z.object({
  field: memberFieldDefinitionSchema,
});

export const updateMemberFieldInputSchema = z.object({
  teamId: z.string(),
  fieldId: z.string(),
  name: z.string().min(1).max(100).optional(),
  options: z.array(z.string().min(1).max(100)).max(50).optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateMemberFieldOutputSchema = z.object({
  field: memberFieldDefinitionSchema,
});

export const archiveMemberFieldInputSchema = z.object({
  teamId: z.string(),
  fieldId: z.string(),
  archived: z.boolean(),
});

export const archiveMemberFieldOutputSchema = z.object({
  field: memberFieldDefinitionSchema,
});

export const setMemberFieldValuesInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
  /** Field-definition id → raw string value. A null/absent value clears it. */
  values: z.record(z.string(), z.string().nullable()),
});

export const setMemberFieldValuesOutputSchema = z.object({
  member: memberSchema,
});

// ---------------------------------------------------------------------------
