/**
 * Importing a roster from a SportAdmin export (#63).
 *
 * The file is parsed in the browser and the *mapped* rows are sent — never the
 * spreadsheet. Columns the coach chose to skip therefore never leave their
 * machine, and oRPC stays plain JSON with no multipart path to maintain.
 *
 * Preview writes nothing. It exists so a coach can see exactly what a commit
 * would do before anything happens.
 */

import { z } from "zod";

/** Nothing sensible imports a whole club in one go; a team is a few dozen. */
export const MAX_IMPORT_ROWS = 500;

/** A guardian as the file describes them — no account, possibly no e-mail. */
export const importContactSchema = z.object({
  name: z.string().min(1).max(200),
  /** Free text as written ("Mamma", "Pappa"), not the guardian|self enum. */
  relation: z.string().max(100).nullable(),
  email: z.string().max(255).nullable(),
  phone: z.string().max(50).nullable(),
});

export type ImportContact = z.infer<typeof importContactSchema>;

/**
 * One row of the file after the mapping step. Custom fields are keyed by
 * *name*, not by definition id: the definitions may not exist yet, and
 * creating them is part of committing (#64).
 */
export const importRowSchema = z.object({
  /** The row's line in the file, so an error can be pointed at. */
  rowNumber: z.number().int().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  /** Raw as it appeared; validated server-side, never trusted from here. */
  personalId: z.string().max(20).nullable(),
  externalRef: z.string().max(100).nullable(),
  email: z.string().max(255).nullable(),
  phone: z.string().max(50).nullable(),
  /** Group names from `Gruppkoppling` — created on commit if new. */
  groups: z.array(z.string().min(1).max(100)).max(20),
  /** Custom field name → raw value. */
  customFields: z.record(z.string().min(1).max(100), z.string().max(2000)),
  contacts: z.array(importContactSchema).max(4),
});

export type ImportRow = z.infer<typeof importRowSchema>;

/** Which rule matched a row to an existing member; null when it is new. */
export const importMatchReasonSchema = z.enum([
  "personalId",
  "externalRef",
  "nameAndBirthDate",
  "email",
]);

export type ImportMatchReason = z.infer<typeof importMatchReasonSchema>;

export const importOutcomeSchema = z.enum([
  "new",
  "update",
  "unchanged",
  "error",
]);

export type ImportOutcome = z.infer<typeof importOutcomeSchema>;

/**
 * One field a commit would change. `redacted` marks a change whose values are
 * withheld on purpose — the personnummer is reported as changed, never shown
 * (ADR-022).
 */
export const importChangeSchema = z.object({
  field: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  redacted: z.boolean(),
});

export type ImportChange = z.infer<typeof importChangeSchema>;

/**
 * Why a row cannot be imported, as a code the UI translates rather than a
 * sentence the server wrote — these are read by a coach mid-import, in Swedish.
 * `detail` carries the offending row number where one is implicated; it never
 * carries a personnummer (ADR-022).
 */
export const importErrorSchema = z.object({
  code: z.enum([
    /** The personnummer did not parse, or its check digit is wrong. */
    "invalidPersonalId",
    /** That personnummer belongs to a different member of this team. */
    "personalIdInUse",
    /** Another row in the same file claims the same person. */
    "duplicateInFile",
    /** Several existing members fit, so picking one would be a guess. */
    "ambiguousMatch",
  ]),
  detail: z.string().nullable(),
});

export type ImportError = z.infer<typeof importErrorSchema>;

export const importRowResultSchema = z.object({
  rowNumber: z.number().int(),
  /** For display, so the UI never has to re-derive a name from the input. */
  name: z.string(),
  outcome: importOutcomeSchema,
  /** The member this row would write to; null for a new one or an error. */
  memberId: z.string().nullable(),
  matchedBy: importMatchReasonSchema.nullable(),
  changes: z.array(importChangeSchema),
  /** Why this row cannot be imported. One bad row never fails the file. */
  errors: z.array(importErrorSchema),
  /** Guardians this row would add; already-present ones are left out. */
  newContacts: z.array(z.string()),
});

export type ImportRowResult = z.infer<typeof importRowResultSchema>;

export const importSummarySchema = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
  errors: z.number().int(),
});

export type ImportSummary = z.infer<typeof importSummarySchema>;

export const previewMemberImportInputSchema = z.object({
  teamId: z.string(),
  rows: z.array(importRowSchema).min(1).max(MAX_IMPORT_ROWS),
});

export const previewMemberImportOutputSchema = z.object({
  rows: z.array(importRowResultSchema),
  summary: importSummarySchema,
  /** Group names the commit would create, in the order first seen. */
  newGroups: z.array(z.string()),
  /** Custom field definitions the commit would create. */
  newCustomFields: z.array(z.string()),
});

/**
 * How two values are compared when deciding whether a row matches an existing
 * member. Lives here rather than in the backend so the preview UI and the
 * server agree on what "matched" means (ADR-010).
 */
export function normaliseForMatch(value: string): string {
  return value.trim().toLocaleLowerCase("sv").replace(/\s+/g, " ");
}

/** A name compared as one string, so "Anna Maria" and "anna  maria" agree. */
export function normaliseName(first: string, last: string): string {
  return `${normaliseForMatch(first)} ${normaliseForMatch(last)}`;
}

/**
 * Committing takes exactly what the preview took, and answers in the same
 * shape. They are aliases on purpose: a commit that accepted anything the
 * preview had not seen could not honour what the preview showed.
 */
export const commitMemberImportInputSchema = previewMemberImportInputSchema;
export const commitMemberImportOutputSchema = previewMemberImportOutputSchema;
