import { z } from "zod";

import { queryBooleanSchema } from "./common.js";

// Groups — Zod schemas (issue #10)
//
// Custom member groups ("A squad", "born 2014") reusable anywhere a "who" is
// selected: roster filtering, call-up squad selection (#16), and post
// targeting (#18). A member can belong to several groups; deleting a group
// never touches its members.
// ---------------------------------------------------------------------------

export const groupSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  memberCount: z.number(),
});

export type Group = z.infer<typeof groupSchema>;

export const listGroupsInputSchema = z.object({
  teamId: z.string(),
});

export const listGroupsOutputSchema = z.object({
  groups: z.array(groupSchema),
});

export const createGroupInputSchema = z.object({
  teamId: z.string(),
  name: z.string().min(1).max(100),
});

export const createGroupOutputSchema = z.object({
  group: groupSchema,
});

export const renameGroupInputSchema = z.object({
  teamId: z.string(),
  groupId: z.string(),
  name: z.string().min(1).max(100),
});

export const renameGroupOutputSchema = z.object({
  group: groupSchema,
});

export const deleteGroupInputSchema = z.object({
  teamId: z.string(),
  groupId: z.string(),
});

export const deleteGroupOutputSchema = z.object({
  deleted: z.literal(true),
});

export const listGroupMembersInputSchema = z.object({
  teamId: z.string(),
  groupId: z.string(),
});

export const listGroupMembersOutputSchema = z.object({
  memberIds: z.array(z.string()),
});

/** Replaces a group's full member list (simplest UI: a multi-select). */
export const setGroupMembersInputSchema = z.object({
  teamId: z.string(),
  groupId: z.string(),
  memberIds: z.array(z.string()),
});

export const setGroupMembersOutputSchema = z.object({
  memberIds: z.array(z.string()),
});

/** Groups a member belongs to — shown on the member detail page. */
export const listMemberGroupsInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
});

export const listMemberGroupsOutputSchema = z.object({
  groups: z.array(groupSchema),
});

/**
 * Activity type colours are Kit palette token names, never hex.
 *
 * The Kit design system allows three colour families and nothing else, so a
 * free-form colour picker would let a team design its way out of the system.
 * Storing the token (rather than the resolved value) also means the palette
 * can be re-themed without touching stored data.
 */
export const activityColourSchema = z.enum([
  "green", // the brand — training, the everyday session
  "ink", // the near-black — matches and other headline fixtures
  "orange", // needs someone to act
  "amber", // partial, provisional
  "neutral", // everything else: meetings, admin, social
]);

export type ActivityColour = z.infer<typeof activityColourSchema>;

export const activityTypeSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  colour: activityColourSchema,
  /** Read by call-ups (#16) to decide which activities get a call-up tab. */
  supportsCallUps: z.boolean(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
});

export type ActivityType = z.infer<typeof activityTypeSchema>;

/**
 * The types every new team starts with (ADR-005). Seeded on team creation and
 * editable afterwards — they are ordinary rows, not protected system records.
 */
export const DEFAULT_ACTIVITY_TYPES: readonly {
  name: string;
  colour: ActivityColour;
  supportsCallUps: boolean;
}[] = [
  { name: "Training", colour: "green", supportsCallUps: false },
  { name: "Match", colour: "ink", supportsCallUps: true },
];

export const listActivityTypesInputSchema = z.object({
  teamId: z.string(),
  includeArchived: queryBooleanSchema.optional(),
});

export const listActivityTypesOutputSchema = z.object({
  activityTypes: z.array(activityTypeSchema),
});

export const createActivityTypeInputSchema = z.object({
  teamId: z.string(),
  name: z.string().min(1).max(100),
  colour: activityColourSchema.optional(),
  supportsCallUps: z.boolean().optional(),
});

export const createActivityTypeOutputSchema = z.object({
  activityType: activityTypeSchema,
});

export const updateActivityTypeInputSchema = z.object({
  teamId: z.string(),
  activityTypeId: z.string(),
  name: z.string().min(1).max(100).optional(),
  colour: activityColourSchema.optional(),
  supportsCallUps: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateActivityTypeOutputSchema = z.object({
  activityType: activityTypeSchema,
});

export const archiveActivityTypeInputSchema = z.object({
  teamId: z.string(),
  activityTypeId: z.string(),
  archived: z.boolean(),
});

export const archiveActivityTypeOutputSchema = z.object({
  activityType: activityTypeSchema,
});

// ---------------------------------------------------------------------------
