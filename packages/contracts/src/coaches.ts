/**
 * Who coaches a team (#98).
 *
 * A coach is not a member of the roster — it is an account holding the club's
 * Coach role scoped to one team, which is what lets the same person coach P14
 * and P16 without being two people (ADR-003's memberships table, one row per
 * team). This module is the team's view of that table: the rows it may add,
 * the rows it may take away, and the invitations still waiting for someone to
 * sign in.
 */

import { z } from "zod";
import { invitationSchema } from "./invitations.js";

/** An account holding the club's Coach role in this team. */
export const teamCoachSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
});

export type TeamCoach = z.infer<typeof teamCoachSchema>;

/** Someone in the club who is not a coach of this team — the picker's rows. */
export const coachCandidateSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  /**
   * What they are in this team today: their team-scoped role, else their
   * club-wide one. Null when they belong to the club through some other team
   * only, and cannot see this one at all.
   */
  currentRole: z.string().nullable(),
  /**
   * False when making them a coach here would *narrow* them: a team-scoped row
   * wins over the club-wide one, so handing an admin the Coach role in one team
   * quietly takes their admin rights away inside it (#74). The reason is stated
   * rather than the row hidden — "why can't I pick her?" deserves an answer.
   */
  addable: z.boolean(),
});

export type CoachCandidate = z.infer<typeof coachCandidateSchema>;

/**
 * Why a member of the roster cannot be appointed.
 *
 * Only two ways left, and both are about the club's own records rather than
 * about waiting for anybody: `noEmail` because an appointment needs an address
 * to attach to, and `widerAccess` because appointing them would take rights
 * away in this team (#74).
 */
export const memberCoachBlockedReasonSchema = z.enum([
  "noEmail",
  "widerAccess",
]);

export type MemberCoachBlockedReason = z.infer<
  typeof memberCoachBlockedReasonSchema
>;

/**
 * Somebody on the team's roster, offered as a coach (#98).
 *
 * A member is a person in a team, not an account (ADR-023). Appointing one
 * therefore has to end at an account, and does so **immediately** — an admin
 * administers the club now, not when somebody else gets round to accepting an
 * invitation. Which account it will be is stated on the row before it is
 * pressed, because the three cases differ in ways worth seeing:
 *
 *  - they have signed in and the account is theirs (`accountName` is null);
 *  - the address on their roster row already belongs to an account, whose name
 *    is given — a child's row usually carries a parent's address, and being
 *    told "this appoints Petra Förälder" is the difference between a decision
 *    and an accident;
 *  - no account holds that address yet, so one is created for it, ready for
 *    the first sign-in that proves the address (`willCreateAccount`).
 */
export const memberCoachCandidateSchema = z.object({
  memberId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  /** The account this would appoint, when one exists already. */
  userId: z.string().nullable(),
  email: z.string().nullable(),
  /** Set when that account is somebody else's name than the member's. */
  accountName: z.string().nullable(),
  /** True when pressing add makes the account as well as the appointment. */
  willCreateAccount: z.boolean(),
  action: z.enum(["add", "blocked"]),
  blockedReason: memberCoachBlockedReasonSchema.nullable(),
});

export type MemberCoachCandidate = z.infer<typeof memberCoachCandidateSchema>;

/**
 * Everything the coaches section draws, from one query (ADR-015): the coaches,
 * the invitations not yet accepted, and who else could be added — from the
 * club's accounts and from the team's own roster. They change together —
 * adding a coach removes a candidate — so they are fetched and invalidated
 * together.
 */
export const teamCoachesOutputSchema = z.object({
  coaches: z.array(teamCoachSchema),
  /** Live invitations for the Coach role in this team, newest first. */
  invitations: z.array(invitationSchema),
  candidates: z.array(coachCandidateSchema),
  memberCandidates: z.array(memberCoachCandidateSchema),
});

export const listTeamCoachesInputSchema = z.object({
  teamId: z.string(),
});

export const listTeamCoachesOutputSchema = teamCoachesOutputSchema;

export const addTeamCoachInputSchema = z.object({
  teamId: z.string(),
  userId: z.string(),
});

export const addTeamCoachOutputSchema = teamCoachesOutputSchema;

export const removeTeamCoachInputSchema = z.object({
  teamId: z.string(),
  userId: z.string(),
});

export const removeTeamCoachOutputSchema = teamCoachesOutputSchema;

/**
 * Appoint somebody who is in neither list, by address (#98).
 *
 * The account is made now and holds the Coach role from this moment, rather
 * than from whenever an invitation is accepted: an admin administering the
 * club should not have to wait for the person they are administering. Signing
 * in with that address later lands on this account — `signInWithProfile`
 * resolves an OAuth profile to an existing user by email — so nothing has to
 * be claimed for the appointment to be real.
 *
 * Narrower than `createInvitation` on purpose: always the club's Coach role,
 * always this team, so the section cannot become a way to hand out any role at
 * all. The gate is `settings.club` regardless (see contact-invitations.ts).
 */
export const addCoachByEmailInputSchema = z.object({
  teamId: z.string(),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
});

export const addCoachByEmailOutputSchema = teamCoachesOutputSchema;

/**
 * Appoint somebody from the team's own roster (#98).
 *
 * One action for what the admin means — "make Karin a coach" — and it takes
 * effect immediately. The account it lands on is whichever the roster row
 * points at: the one they signed in with, the one that already holds the
 * address, or one created here and now for an address nobody has claimed yet.
 */
export const addMemberAsCoachInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
});

export const addMemberAsCoachOutputSchema = teamCoachesOutputSchema.extend({
  /** Whether an account had to be made, so the section can say so. */
  outcome: z.enum(["added", "accountCreated"]),
});
