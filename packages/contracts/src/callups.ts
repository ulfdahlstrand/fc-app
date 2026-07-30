import { z } from "zod";

import { isoInstantSchema, queryBooleanSchema } from "./common.js";

// Call-ups (issue #16) — the matchtrupp.
//
// One call-up per activity, holding the squad. An invitation exists for every
// selected member and starts as `pending`; #17 lets players and guardians
// answer it themselves.
//
// A call-up has a draft and a published state. Publishing is what tells the
// squad they are in it, so selecting fourteen names must be possible without
// anyone's phone buzzing on each tap.
// ---------------------------------------------------------------------------

export const callupResponseSchema = z.enum([
  "pending", // not decided yet — Kit's dashed ring
  "accepted",
  "declined",
]);

export type CallupResponse = z.infer<typeof callupResponseSchema>;

export const callupSchema = z.object({
  id: z.string(),
  activityId: z.string(),
  note: z.string().nullable(),
  published: z.boolean(),
});

export type Callup = z.infer<typeof callupSchema>;

/**
 * Who put the answer there (#17). A coach may answer on a member's behalf —
 * "he phoned to say he can't make it" — and when they do, the squad has to be
 * able to see that it came from the coach, and from which one.
 *
 * `onBehalf` is false when the responder was answering for themselves or for
 * a child they are guardian to, *including* when that person is also the
 * coach: answering for your own child is nobody's behalf but your own.
 */
export const callupResponderSchema = z.object({
  userId: z.string().nullable(),
  name: z.string().nullable(),
  onBehalf: z.boolean(),
});

export type CallupResponder = z.infer<typeof callupResponderSchema>;

export const callupInvitationSchema = z.object({
  memberId: z.string(),
  response: callupResponseSchema,
  /** When the member (or their guardian, or a coach) answered; null while pending. */
  respondedAt: isoInstantSchema.nullable(),
  /** The member's own words — "away that weekend". */
  responseNote: z.string().nullable(),
  /** null while pending. */
  respondedBy: callupResponderSchema.nullable(),
});

export type CallupInvitation = z.infer<typeof callupInvitationSchema>;

export const getCallupInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
});

export const getCallupOutputSchema = z.object({
  /** null until a squad is first saved — an activity has no call-up by default. */
  callup: callupSchema.nullable(),
  invitations: z.array(callupInvitationSchema),
});

/**
 * The squad, as a whole. Members not in the list are removed; members already
 * in it keep the answer they gave, so saving a squad again never silently
 * discards a reply.
 */
export const setCallupSquadInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
  memberIds: z.array(z.string()),
});

export const setCallupSquadOutputSchema = z.object({
  callup: callupSchema,
  invitations: z.array(callupInvitationSchema),
});

export const updateCallupInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
  note: z.string().max(2000).nullable().optional(),
  published: z.boolean().optional(),
});

export const updateCallupOutputSchema = z.object({
  callup: callupSchema,
});

// ---------------------------------------------------------------------------
// Call-up responses (issue #17)
//
// Players and guardians answer for themselves. A user may respond only for
// members they are *linked* to — themselves, or a child they are guardian for
// (#9). That check is the whole security surface of this feature: everything
// else here is a list.
//
// Only `accepted` and `declined` can be sent. `pending` is where an invitation
// starts, not somewhere a person can put it back to.
// ---------------------------------------------------------------------------

export const callupAnswerSchema = z.enum(["accepted", "declined"]);

export type CallupAnswer = z.infer<typeof callupAnswerSchema>;

export const respondToCallupInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
  /** Which linked member is answering — a guardian answers per child. */
  memberId: z.string(),
  response: callupAnswerSchema,
  note: z.string().max(500).nullable().optional(),
});

export const respondToCallupOutputSchema = z.object({
  invitation: callupInvitationSchema,
});

/** One call-up awaiting (or holding) an answer, for a member I am linked to. */
export const myCallupSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  activityId: z.string(),
  startsAt: isoInstantSchema,
  endsAt: isoInstantSchema.nullable(),
  title: z.string().nullable(),
  activityTypeId: z.string(),
  location: z.string().nullable(),
  /** The coach's note on the squad, if any. */
  callupNote: z.string().nullable(),
  memberId: z.string(),
  memberName: z.string(),
  response: callupResponseSchema,
  responseNote: z.string().nullable(),
  respondedBy: callupResponderSchema.nullable(),
});

export type MyCallup = z.infer<typeof myCallupSchema>;

export const myCallupsInputSchema = z.object({});

export const myCallupsOutputSchema = z.object({
  callups: z.array(myCallupSchema),
  /** What the dashboard (#20) shows as "unanswered". */
  pending: z.number().int(),
});

/** A call-up in the coach's overview, with its response tally. */
export const callupSummarySchema = z.object({
  activityId: z.string(),
  startsAt: isoInstantSchema,
  title: z.string().nullable(),
  activityTypeId: z.string(),
  location: z.string().nullable(),
  cancelled: z.boolean(),
  published: z.boolean(),
  squad: z.number().int(),
  accepted: z.number().int(),
  declined: z.number().int(),
  pending: z.number().int(),
});

export type CallupSummary = z.infer<typeof callupSummarySchema>;

export const listCallupsInputSchema = z.object({
  teamId: z.string(),
  /** Past call-ups are history; the default is what is still to come. */
  includePast: queryBooleanSchema.optional(),
});

export const listCallupsOutputSchema = z.object({
  callups: z.array(callupSummarySchema),
  /** Unanswered invitations across the listed call-ups, for #20. */
  pending: z.number().int(),
});

// ---------------------------------------------------------------------------
