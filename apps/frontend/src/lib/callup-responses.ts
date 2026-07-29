/**
 * Call-up responses (issue #17).
 *
 * Two audiences, one file: "what am I being asked" for players and guardians,
 * and "who has answered" for coaches.
 *
 * `myCallups` is driven by the guardian links (#9), not by the selected team —
 * a guardian with children in two teams is asked about both, and picking a
 * team in the switcher should not hide one of their questions.
 */
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
      // The answer moves three views: my own list, the coach's overview, and
      // the squad on the activity page.
      await queryClient.invalidateQueries({
        queryKey: orpcQuery.myCallups.key({ input: {} }),
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
