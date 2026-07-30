import { z } from "zod";

/**
 * Guardian relation (#9). Declared here (ahead of the guardians section) so
 * member-bound invitations below can reference it.
 */
export const guardianRelationSchema = z.enum(["guardian", "self"]);

export type GuardianRelation = z.infer<typeof guardianRelationSchema>;

// ---------------------------------------------------------------------------
// Guardians — Zod schemas (issue #9)
//
// Links a user account to a member. `self` = the member is the user (a player
// with their own account); `guardian` = a parent/carer. A user can be linked
// to several members (siblings); a member can have several guardians.
//
// (guardianRelationSchema is declared earlier — before the invitations
// section — because member-bound invitations reference it.)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
