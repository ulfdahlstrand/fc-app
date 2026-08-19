/** Team coach data hooks (#98). */
import { useMutation, useQuery } from "@tanstack/react-query";
import { addCoachByEmailInputSchema } from "@fc-app/contracts";
import type { CoachCandidate, MemberCoachCandidate } from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { requiredText } from "./form";
import { orpcQuery } from "./orpc-query";

/** Form schema for the by-address form, derived from the contract (ADR-010). */
export const coachByEmailFormSchema = z.object({
  name: requiredText(addCoachByEmailInputSchema.shape.name),
  email: requiredText(addCoachByEmailInputSchema.shape.email),
});

export type CoachByEmailFormValues = z.input<typeof coachByEmailFormSchema>;
export type CoachByEmailFormOutput = z.output<typeof coachByEmailFormSchema>;

export function teamCoachesQueryOptions(teamId: string) {
  return orpcQuery.listTeamCoaches.queryOptions({ input: { teamId } });
}

export function useTeamCoaches(teamId: string) {
  return useQuery(teamCoachesQueryOptions(teamId));
}

/** Coaches, invitations and candidates arrive together, so they refresh together. */
function invalidate(teamId: string) {
  return queryClient.invalidateQueries({
    queryKey: orpcQuery.listTeamCoaches.key({ input: { teamId } }),
  });
}

export function useAddTeamCoach(teamId: string) {
  return useMutation({
    mutationFn: (userId: string) => orpc.addTeamCoach({ teamId, userId }),
    onSuccess: () => invalidate(teamId),
  });
}

export function useAddMemberAsCoach(teamId: string) {
  return useMutation({
    mutationFn: (memberId: string) =>
      orpc.addMemberAsCoach({ teamId, memberId }),
    onSuccess: () => invalidate(teamId),
  });
}

export function useRemoveTeamCoach(teamId: string) {
  return useMutation({
    mutationFn: (userId: string) => orpc.removeTeamCoach({ teamId, userId }),
    onSuccess: () => invalidate(teamId),
  });
}

export function useAddCoachByEmail(teamId: string) {
  return useMutation({
    mutationFn: (input: { name: string; email: string }) =>
      orpc.addCoachByEmail({ teamId, ...input }),
    onSuccess: () => invalidate(teamId),
  });
}

/**
 * Revoking uses the club-wide invitation endpoint — an invitation is an
 * invitation — so the coaches query has to be told about it by hand.
 */
export function useRevokeCoachInvitation(clubId: string, teamId: string) {
  return useMutation({
    mutationFn: (invitationId: string) =>
      orpc.revokeInvitation({ clubId, invitationId }),
    onSuccess: () => invalidate(teamId),
  });
}

/**
 * The picker's rows, in the order they are useful: people who can be appointed
 * first, then the ones that would lose access by it, each group by name.
 *
 * A name is not enough to tell two parents apart, so the sort is stable on the
 * address underneath it.
 */
export function sortCandidates(
  candidates: readonly CoachCandidate[],
): CoachCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.addable !== b.addable) return a.addable ? -1 : 1;
    return (
      a.name.localeCompare(b.name, "sv") || a.email.localeCompare(b.email, "sv")
    );
  });
}

/**
 * The roster's rows, same idea: the ones that can be appointed today first,
 * then the ones the club cannot reach, each group by name.
 *
 * Most of a roster is children who have never signed in, so without this the
 * two or three people an admin can actually pick sit scattered among thirty
 * who are greyed out.
 */
export function sortMemberCandidates(
  candidates: readonly MemberCoachCandidate[],
): MemberCoachCandidate[] {
  return [...candidates].sort((a, b) => {
    const blocked =
      Number(a.action === "blocked") - Number(b.action === "blocked");
    if (blocked !== 0) return blocked;
    return (
      a.lastName.localeCompare(b.lastName, "sv") ||
      a.firstName.localeCompare(b.firstName, "sv")
    );
  });
}
