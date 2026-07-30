/** Tracking lists (issue #19). */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createTrackingDefinitionInputSchema,
  isTrackingComplete,
  trackingValueTypeSchema,
  type TrackingDefinition,
  type TrackingEntry,
  type TrackingValueType,
} from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { requiredText } from "./form";
import { orpcQuery } from "./orpc-query";

export { isTrackingComplete };

/**
 * The definition form, derived from the contract's create input (ADR-007) so the
 * length rules live in one place. `valueType` is only offered when creating —
 * see `TrackingDialog` for why it cannot be changed afterwards.
 */
export const trackingFormSchema = z.object({
  name: requiredText(createTrackingDefinitionInputSchema.shape.name),
  valueType: trackingValueTypeSchema,
});

export type TrackingFormValues = z.input<typeof trackingFormSchema>;
export type TrackingFormOutput = z.output<typeof trackingFormSchema>;

export const TRACKING_VALUE_TYPES = trackingValueTypeSchema.options;

export function trackingDefinitionsQueryOptions(
  teamId: string,
  includeArchived = false,
) {
  return orpcQuery.listTrackingDefinitions.queryOptions({
    input: { teamId, includeArchived },
  });
}

export function useTrackingDefinitions(teamId: string, includeArchived = false) {
  return useQuery(trackingDefinitionsQueryOptions(teamId, includeArchived));
}

export function useTrackingMatrix(teamId: string, groupId?: string) {
  return useQuery(
    orpcQuery.trackingMatrix.queryOptions({
      input: { teamId, ...(groupId ? { groupId } : {}) },
    }),
  );
}

export function useMemberTracking(teamId: string, memberId: string) {
  return useQuery(
    orpcQuery.memberTracking.queryOptions({ input: { teamId, memberId } }),
  );
}

/**
 * Everything a changed tick or definition is visible in: the matrix, the member
 * page, and the dashboard count of what is still outstanding (#20).
 */
async function invalidateTracking(teamId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: orpcQuery.listTrackingDefinitions.key({ input: { teamId } }),
    }),
    queryClient.invalidateQueries({
      queryKey: orpcQuery.trackingMatrix.key({ input: { teamId } }),
    }),
    queryClient.invalidateQueries({
      queryKey: orpcQuery.memberTracking.key({ input: { teamId } }),
    }),
    queryClient.invalidateQueries({
      queryKey: orpcQuery.dashboard.key({ input: { teamId } }),
    }),
  ]);
}

export function useCreateTrackingDefinition(teamId: string) {
  return useMutation({
    mutationFn: (input: { name: string; valueType: TrackingValueType }) =>
      orpc.createTrackingDefinition({ teamId, ...input }),
    onSuccess: () => invalidateTracking(teamId),
  });
}

export function useUpdateTrackingDefinition(teamId: string) {
  return useMutation({
    mutationFn: (input: {
      definitionId: string;
      name?: string;
      sortOrder?: number;
    }) => orpc.updateTrackingDefinition({ teamId, ...input }),
    onSuccess: () => invalidateTracking(teamId),
  });
}

export function useArchiveTrackingDefinition(teamId: string) {
  return useMutation({
    mutationFn: (input: { definitionId: string; archived: boolean }) =>
      orpc.archiveTrackingDefinition({ teamId, ...input }),
    onSuccess: () => invalidateTracking(teamId),
  });
}

export function useSetTrackingEntry(teamId: string) {
  return useMutation({
    mutationFn: (input: {
      definitionId: string;
      memberId: string;
      value: string | null;
    }) => orpc.setTrackingEntry({ teamId, ...input }),
    onSuccess: () => invalidateTracking(teamId),
  });
}

/** The cell key the matrix indexes entries by. */
export function cellKey(definitionId: string, memberId: string): string {
  return `${definitionId}:${memberId}`;
}

export function entriesByCell(
  entries: TrackingEntry[],
): Map<string, TrackingEntry> {
  return new Map(
    entries.map((entry) => [cellKey(entry.definitionId, entry.memberId), entry]),
  );
}

/** How many members have settled a definition, and out of how many. */
export function definitionProgress(
  definition: Pick<TrackingDefinition, "id" | "valueType">,
  memberIds: string[],
  byCell: Map<string, TrackingEntry>,
): { done: number; total: number } | null {
  if (definition.valueType !== "done") return null;
  const done = memberIds.filter((memberId) =>
    isTrackingComplete(definition, byCell.get(cellKey(definition.id, memberId))),
  ).length;
  return { done, total: memberIds.length };
}
