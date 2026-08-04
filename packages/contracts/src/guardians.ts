/** Links between user accounts and members — who may answer for whom (ADR-016). */

import { z } from "zod";

/** Guardian relation (#9). */
export const guardianRelationSchema = z.enum(["guardian", "self"]);

export type GuardianRelation = z.infer<typeof guardianRelationSchema>;

/** A user linked to a member, as shown on the member detail page. */
export const memberGuardianSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  relation: guardianRelationSchema,
});

export type MemberGuardian = z.infer<typeof memberGuardianSchema>;

/** A club user offered in the guardian picker. */
export const clubUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

export type ClubUser = z.infer<typeof clubUserSchema>;

/** A member the signed-in user is linked to, with team/club context. */
export const linkedMemberSchema = z.object({
  memberId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  teamId: z.string(),
  teamName: z.string(),
  clubName: z.string(),
  relation: guardianRelationSchema,
  /**
   * Sent so the guardian's own browser can work out when this member turns
   * eighteen — it is the person reading the notice whose "today" counts (#66).
   */
  birthDate: z.string().nullable(),
});

export type LinkedMember = z.infer<typeof linkedMemberSchema>;

export const listMemberGuardiansInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
});

export const listMemberGuardiansOutputSchema = z.object({
  guardians: z.array(memberGuardianSchema),
});

export const addGuardianInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
  userId: z.string(),
  relation: guardianRelationSchema,
});

export const addGuardianOutputSchema = z.object({
  guardians: z.array(memberGuardianSchema),
});

export const removeGuardianInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
  userId: z.string(),
});

export const removeGuardianOutputSchema = z.object({
  guardians: z.array(memberGuardianSchema),
});

export const listClubUsersInputSchema = z.object({
  teamId: z.string(),
});

export const listClubUsersOutputSchema = z.object({
  users: z.array(clubUserSchema),
});

export const myMembersInputSchema = z.object({});

export const myMembersOutputSchema = z.object({
  members: z.array(linkedMemberSchema),
});


/**
 * Someone attached to a member who may not have an account — the `Målsman`
 * columns of an import (#64). A guardian with an account also appears in
 * `listMemberGuardians`; this list is what the club actually knows about them,
 * including the phone number a coach rings when a child does not turn up.
 */
export const memberContactSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Free text as written ("Mamma", "Pappa"), not the guardian|self enum. */
  relation: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  /** True once this person has signed in and been linked. */
  hasAccount: z.boolean(),
});

export type MemberContact = z.infer<typeof memberContactSchema>;

export const listMemberContactsInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
});

export const listMemberContactsOutputSchema = z.object({
  contacts: z.array(memberContactSchema),
});

/**
 * Turning imported contacts into invitations (#65).
 *
 * Narrower than `createInvitation` on purpose: always the club's guardian
 * role, always bound to one member, never club- or team-wide. That is why it
 * is a roster action rather than a club-settings one.
 */
export const inviteMemberContactsInputSchema = z.object({
  teamId: z.string(),
  /** Limit to these members; omit for every member of the team. */
  memberIds: z.array(z.string()).max(500).optional(),
});

export const inviteMemberContactsOutputSchema = z.object({
  invited: z.number().int(),
  /** Contacts left alone, and why — an empty reason list means none were. */
  skippedNoEmail: z.number().int(),
  skippedHasAccount: z.number().int(),
  skippedAlreadyInvited: z.number().int(),
});

/** How many imported contacts are still waiting, for the roster to show. */
export const pendingContactInvitesInputSchema = z.object({
  teamId: z.string(),
});

export const pendingContactInvitesOutputSchema = z.object({
  /** Contacts with an e-mail, no account, and no live invitation. */
  invitable: z.number().int(),
});
