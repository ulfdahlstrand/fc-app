/**
 * Call-up data hooks (issue #16) — the matchtrupp.
 *
 * Reading needs members.view; picking and publishing need callups.manage.
 * Responding is #17.
 *
 * The squad is saved as a whole, the same shape attendance uses: a coach picks
 * fourteen names standing somewhere with one bar of signal, and one request is
 * more likely to land than fourteen.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CallupResponse } from "@fc-app/contracts";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { orpcQuery } from "./orpc-query";

export function callupQueryOptions(teamId: string, activityId: string) {
  return orpcQuery.getCallup.queryOptions({ input: { teamId, activityId } });
}

export function useCallup(teamId: string, activityId: string) {
  return useQuery(callupQueryOptions(teamId, activityId));
}

async function invalidateCallup(
  teamId: string,
  activityId: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: orpcQuery.getCallup.key({ input: { teamId, activityId } }),
  });
}

export function useSetCallupSquad(teamId: string, activityId: string) {
  return useMutation({
    mutationFn: (memberIds: string[]) =>
      orpc.setCallupSquad({ teamId, activityId, memberIds }),
    onSuccess: () => invalidateCallup(teamId, activityId),
  });
}

export function useUpdateCallup(teamId: string, activityId: string) {
  return useMutation({
    mutationFn: (input: { note?: string | null; published?: boolean }) =>
      orpc.updateCallup({ teamId, activityId, ...input }),
    onSuccess: () => invalidateCallup(teamId, activityId),
  });
}

/**
 * Kit's state colours, applied to a reply. Accepted is the brand green that
 * also means present; declined is the orange that means someone must act;
 * pending is the dashed ring, because in Kit dashed always means "not decided
 * yet" — which is exactly what an unanswered call-up is.
 */
export const RESPONSE_DISC: Record<CallupResponse, string> = {
  accepted: "bg-brand text-white",
  declined: "bg-[var(--orange-500)] text-white",
  pending:
    "border-2 border-dashed border-[var(--border-dashed)] text-[var(--neutral-500)]",
};

/** Kit is nearly icon-free: ✓, ✕ and ? carry this on their own. */
export const RESPONSE_GLYPH: Record<CallupResponse, string> = {
  accepted: "✓",
  declined: "✕",
  pending: "?",
};

export interface SquadCounts {
  squad: number;
  accepted: number;
  declined: number;
  pending: number;
}

export function countResponses(
  invitations: { response: CallupResponse }[],
): SquadCounts {
  return {
    squad: invitations.length,
    accepted: invitations.filter((one) => one.response === "accepted").length,
    declined: invitations.filter((one) => one.response === "declined").length,
    pending: invitations.filter((one) => one.response === "pending").length,
  };
}

/** Members in `squad` but not saved, or saved but no longer in `squad`. */
export function squadChanged(squad: Set<string>, saved: Set<string>): boolean {
  if (squad.size !== saved.size) return true;
  for (const id of squad) if (!saved.has(id)) return true;
  return false;
}
