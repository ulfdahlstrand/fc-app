/**
 * Activity type data hooks (issue #11).
 *
 * Types are team-scoped and read with members.view (the calendar needs them);
 * managing them requires settings.team. Types are archived, never deleted, so
 * activities that reference a retired type keep rendering.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  activityColourSchema,
  createActivityTypeInputSchema,
  type ActivityColour,
} from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { requiredText } from "./form";
import { orpcQuery } from "./orpc-query";

/**
 * Form schema for the create/edit dialog, derived from the contract's create
 * input (ADR-007) so the length rules live there, not here. See `lib/form.ts`.
 */
export const activityTypeFormSchema = z.object({
  name: requiredText(createActivityTypeInputSchema.shape.name),
  colour: activityColourSchema,
  supportsCallUps: z.boolean(),
});

/** What the inputs hold while editing. */
export type ActivityTypeFormValues = z.input<typeof activityTypeFormSchema>;

/** What the API accepts, after parsing. */
export type ActivityTypeFormOutput = z.output<typeof activityTypeFormSchema>;

/**
 * The selectable colours, in the order the swatch row renders them.
 *
 * Kit allows three colour families and nothing else, so this is the whole
 * palette — see `activityColourSchema` in the contract.
 */
export const ACTIVITY_COLOURS = activityColourSchema.options;

/**
 * Kit swatch/dot classes per colour token. Kept as a lookup rather than an
 * interpolated class name so Tailwind can see every class at build time.
 */
export const ACTIVITY_COLOUR_DOT: Record<ActivityColour, string> = {
  green: "bg-brand",
  ink: "bg-ink",
  orange: "bg-[var(--orange-500)]",
  amber: "bg-[var(--amber-500)]",
  neutral: "bg-[var(--neutral-450)]",
};

/**
 * Kit surface/text pairs per colour token, for the chips an activity gets on
 * the calendar (#12). The tints are the ones Kit already assigns to states —
 * present green, absent orange, late amber — plus solid ink, which Kit uses
 * for the "next fixture" card and therefore for matches.
 */
export const ACTIVITY_COLOUR_CHIP: Record<ActivityColour, string> = {
  green: "bg-surface-present text-ink",
  ink: "bg-ink text-white",
  orange: "bg-surface-absent text-absent",
  amber: "bg-surface-late text-late",
  neutral: "bg-[var(--neutral-100)] text-ink",
};

export function activityTypesQueryOptions(
  teamId: string,
  includeArchived = false
) {
  return orpcQuery.listActivityTypes.queryOptions({
    input: { teamId, includeArchived },
  });
}

export function useActivityTypes(teamId: string, includeArchived = false) {
  return useQuery(activityTypesQueryOptions(teamId, includeArchived));
}

async function invalidateActivityTypes(teamId: string): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: orpcQuery.listActivityTypes.key({ input: { teamId } }),
  });
}

export function useCreateActivityType(teamId: string) {
  return useMutation({
    mutationFn: (input: {
      name: string;
      colour?: ActivityColour;
      supportsCallUps?: boolean;
    }) => orpc.createActivityType({ teamId, ...input }),
    onSuccess: () => invalidateActivityTypes(teamId),
  });
}

export function useUpdateActivityType(teamId: string) {
  return useMutation({
    mutationFn: (input: {
      activityTypeId: string;
      name?: string;
      colour?: ActivityColour;
      supportsCallUps?: boolean;
      sortOrder?: number;
    }) => orpc.updateActivityType({ teamId, ...input }),
    onSuccess: () => invalidateActivityTypes(teamId),
  });
}

export function useArchiveActivityType(teamId: string) {
  return useMutation({
    mutationFn: (input: { activityTypeId: string; archived: boolean }) =>
      orpc.archiveActivityType({ teamId, ...input }),
    onSuccess: () => invalidateActivityTypes(teamId),
  });
}
