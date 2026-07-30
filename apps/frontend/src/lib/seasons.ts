/** Season data hooks (issue #13). */
import { useMutation, useQuery } from "@tanstack/react-query";
import { seasonWriteFields } from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { requiredText } from "./form";
import { orpcQuery } from "./orpc-query";

export function seasonsQueryOptions(teamId: string) {
  return orpcQuery.listSeasons.queryOptions({ input: { teamId } });
}

export function useSeasons(teamId: string) {
  return useQuery(seasonsQueryOptions(teamId));
}

async function invalidateSeasons(teamId: string): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: orpcQuery.listSeasons.key({ input: { teamId } }),
  });
  // A changed range changes which activities a season-filtered list shows.
  await queryClient.invalidateQueries({
    queryKey: orpcQuery.listActivities.key({ input: { teamId } }),
  });
}

/** Form schema for the season dialog, derived from the contract's write fields (ADR-007). */
export const seasonFormSchema = z
  .object({
    name: requiredText(seasonWriteFields.name),
    startsOn: requiredText(seasonWriteFields.startsOn),
    endsOn: requiredText(seasonWriteFields.endsOn),
  })
  .refine((value) => value.endsOn >= value.startsOn, { path: ["endsOn"] });

/** What the inputs hold while editing. */
export type SeasonFormValues = z.input<typeof seasonFormSchema>;

/** What the API accepts, after parsing. */
export type SeasonWriteInput = z.output<typeof seasonFormSchema>;

export function useCreateSeason(teamId: string) {
  return useMutation({
    mutationFn: (input: SeasonWriteInput) =>
      orpc.createSeason({ teamId, ...input }),
    onSuccess: () => invalidateSeasons(teamId),
  });
}

export function useUpdateSeason(teamId: string) {
  return useMutation({
    mutationFn: (input: SeasonWriteInput & { seasonId: string }) =>
      orpc.updateSeason({ teamId, ...input }),
    onSuccess: () => invalidateSeasons(teamId),
  });
}

export function useDeleteSeason(teamId: string) {
  return useMutation({
    mutationFn: (input: { seasonId: string }) =>
      orpc.deleteSeason({ teamId, ...input }),
    onSuccess: () => invalidateSeasons(teamId),
  });
}
