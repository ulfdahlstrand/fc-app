/** Call-up responses (issue #17). */
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CallupAnswer, MyCallup } from "@fc-app/contracts";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { orpcQuery } from "./orpc-query";

export function useMyCallups() {
  return useQuery(orpcQuery.myCallups.queryOptions({ input: {} }));
}

export function useTeamCallups(teamId: string, includePast = false) {
  return useQuery(
    orpcQuery.listCallups.queryOptions({ input: { teamId, includePast } }),
  );
}

export function useRespondToCallup() {
  return useMutation({
    mutationFn: (input: {
      teamId: string;
      activityId: string;
      memberId: string;
      response: CallupAnswer;
      note?: string | null;
    }) => orpc.respondToCallup(input),
    onSuccess: async (_data, input) => {
      await queryClient.invalidateQueries({
        queryKey: orpcQuery.myCallups.key({ input: {} }),
      });
      await queryClient.invalidateQueries({
        queryKey: orpcQuery.dashboard.key({ input: { teamId: input.teamId } }),
      });
      await queryClient.invalidateQueries({
        queryKey: orpcQuery.listCallups.key({ input: { teamId: input.teamId } }),
      });
      await queryClient.invalidateQueries({
        queryKey: orpcQuery.getCallup.key({
          input: { teamId: input.teamId, activityId: input.activityId },
        }),
      });
    },
  });
}

/**
 * One card per member per call-up, grouped by activity — a guardian with two
 * children in the same squad answers twice, and the two answers must not look
 * like one question asked twice.
 */
export function groupByActivity(callups: MyCallup[]): {
  activityId: string;
  entries: MyCallup[];
}[] {
  const groups: { activityId: string; entries: MyCallup[] }[] = [];
  for (const callup of callups) {
    const last = groups[groups.length - 1];
    // The API returns them in start order, so a run-length grouping keeps the
    // activities in order too.
    if (last && last.activityId === callup.activityId) {
      last.entries.push(callup);
    } else {
      groups.push({ activityId: callup.activityId, entries: [callup] });
    }
  }
  return groups;
}
