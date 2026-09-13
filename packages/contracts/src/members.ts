/** The roster, and the custom fields a team defines for it (ADR-005, ADR-014). */

import { z } from "zod";
import { queryBooleanSchema } from "./common.js";

export const memberSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  birthYear: z.number().int().nullable(),
  /** `YYYY-MM-DD`, derived from the personnummer when there is one (ADR-022). */
  birthDate: z.string().nullable(),
  /**
   * Full (`20170314-2412`) for a caller with `members.manage`, masked
   * (`20170314-****`) for everyone else, null when the member has none. The
   * server decides which; a client cannot ask for the full number (ADR-022).
   */
  personalId: z.string().nullable(),
  /** The exporting system's own key ("Medlems Nr"), when a file carried one. */
  externalRef: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  archived: z.boolean(),
  /** Custom field values keyed by field-definition id (#8), raw string form. */
  customFields: z.record(z.string(), z.string()),
});

export type Member = z.infer<typeof memberSchema>;

/** What a member is called, everywhere: `Ulf Dahlstrand` (ADR-010). */
export function formatMemberName(
  member: Pick<Member, "firstName" | "lastName">
): string {
  // An imported attendance file can carry a one-word name — the SportAdmin
  // page gives a full name that is split on the first space — so the join
  // has to survive an empty half without leaving a stray space behind.
  return [member.firstName.trim(), member.lastName.trim()]
    .filter((part) => part !== "")
    .join(" ");
}

/**
 * The one order member names are listed in: **by first name, then last** —
 * the same string `formatMemberName` renders, sorted the way it reads.
 *
 * Most membership registers sort by surname, and this app did too, which left
 * every list looking unordered to anyone who does not know the surnames.
 *
 * `sv` collation, so `Å Ä Ö` fall after `Z`. The SQL `ORDER BY` clauses that
 * mirror this for performance name it explicitly (ADR-010): see
 * `procedures/members.ts`, `tracking.ts`, `coaches.ts` and `guardians.ts`.
 */
export function compareMemberNames(
  a: Pick<Member, "firstName" | "lastName">,
  b: Pick<Member, "firstName" | "lastName">
): number {
  return (
    a.firstName.localeCompare(b.firstName, "sv") ||
    a.lastName.localeCompare(b.lastName, "sv")
  );
}

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
  /**
   * Whether the roster may show the field as a column. False means the field
   * lives on the member's own page only — the team's decision about what
   * belongs in a list, above each user's own pick of which of those to show.
   */
  showInList: z.boolean(),
  archived: z.boolean(),
});

export type MemberFieldDefinition = z.infer<
  typeof memberFieldDefinitionSchema
>;

/** Validates and normalizes a raw value against a field definition. */
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

/** Fields accepted when creating or updating a member. */
export const memberWriteFields = {
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  birthYear: z.number().int().min(MIN_BIRTH_YEAR).max(MAX_BIRTH_YEAR).nullable(),
  email: z.string().email().max(255).nullable(),
  phone: z.string().max(50).nullable(),
  /**
   * Raw as typed — any form `parsePersonalId` accepts. Normalising and
   * rejecting happen server-side, so the length cap here is only a guard
   * against a client sending something absurd. Null clears it.
   */
  personalId: z.string().max(20).nullable(),
  externalRef: z.string().max(100).nullable(),
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
  /**
   * Member id → the groups it belongs to (#10), **ordered by group name** so
   * a client can take the first without resolving the names. Only the roster
   * asks about groups, so this rides on the list rather than on
   * `memberSchema`, where every mutation response would have to invent it.
   */
  groupIds: z.record(z.string(), z.array(z.string())),
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
  personalId: memberWriteFields.personalId.optional(),
  externalRef: memberWriteFields.externalRef.optional(),
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
  personalId: memberWriteFields.personalId.optional(),
  externalRef: memberWriteFields.externalRef.optional(),
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
  showInList: z.boolean().optional(),
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
  showInList: z.boolean().optional(),
});

export const updateMemberFieldOutputSchema = z.object({
  field: memberFieldDefinitionSchema,
});

/**
 * Reordering is one gesture — a field moved a step, or a list dragged into
 * shape — so it is one request carrying the whole order, not a `sortOrder`
 * write per field that could interleave with someone else's (ADR-019).
 *
 * The ids are the team's fields in the order they should end up in. A partial
 * list is allowed and the fields it leaves out keep their relative order
 * *after* the listed ones, so a stale client cannot silently drop a field that
 * someone else added while it was looking.
 */
export const reorderMemberFieldsInputSchema = z.object({
  teamId: z.string(),
  fieldIds: z.array(z.string()).min(1).max(200),
});

export const reorderMemberFieldsOutputSchema = z.object({
  fields: z.array(memberFieldDefinitionSchema),
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

