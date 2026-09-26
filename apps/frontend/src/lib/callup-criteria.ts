/** Match levels and the squad proposal (ADR-028) — hooks and display helpers. */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  scaleLabelFor,
  type CallupCriteria,
  type CallupLevelScale,
  type CallupSlot,
  type CallupTemplate,
} from "@fc-app/contracts";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { orpcQuery } from "./orpc-query";

export function callupTemplatesQueryOptions(
  teamId: string,
  includeArchived = false,
) {
  return orpcQuery.listCallupTemplates.queryOptions({
    input: { teamId, includeArchived },
  });
}

export function useCallupTemplates(teamId: string, includeArchived = false) {
  return useQuery(callupTemplatesQueryOptions(teamId, includeArchived));
}

async function invalidateTemplates(teamId: string): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: orpcQuery.listCallupTemplates.key({ input: { teamId } }),
  });
}

export interface CallupTemplateWrite {
  name: string;
  levelMetricId: string;
  minAttendanceRate: number | null;
  attendanceActivityTypeId: string | null;
  slots: CallupSlot[];
  minCoachChildren: number;
}

export function useCreateCallupTemplate(teamId: string) {
  return useMutation({
    mutationFn: (input: CallupTemplateWrite) =>
      orpc.createCallupTemplate({ teamId, ...input }),
    onSuccess: () => invalidateTemplates(teamId),
  });
}

export function useUpdateCallupTemplate(teamId: string) {
  return useMutation({
    mutationFn: (input: Partial<CallupTemplateWrite> & { templateId: string }) =>
      orpc.updateCallupTemplate({ teamId, ...input }),
    onSuccess: () => invalidateTemplates(teamId),
  });
}

export function useArchiveCallupTemplate(teamId: string) {
  return useMutation({
    mutationFn: (input: { templateId: string; archived: boolean }) =>
      orpc.archiveCallupTemplate({ teamId, ...input }),
    onSuccess: () => invalidateTemplates(teamId),
  });
}

/** Levels, attendance and matches played — only fetched once a level is chosen. */
export function useCallupCandidates(
  teamId: string,
  activityId: string,
  templateId: string | null,
  enabled: boolean,
) {
  return useQuery({
    ...orpcQuery.callupCandidates.queryOptions({
      input: { teamId, activityId, templateId: templateId ?? "" },
    }),
    enabled: enabled && templateId !== null,
  });
}

/** A step's name, or the bare number on a scale without names. */
export function levelName(scale: CallupLevelScale, level: number): string {
  return scaleLabelFor(scale, level) ?? String(level);
}

/** "Lätt / Lätt/Medel" — what a slot accepts, lowest step first. */
export function slotLabel(slot: CallupSlot, scale: CallupLevelScale): string {
  return [...slot.levels]
    .sort((a, b) => a - b)
    .map((level) => levelName(scale, level))
    .join(" · ");
}

/** A call-up's criteria, freshly copied from a template. */
export function criteriaFromTemplate(template: CallupTemplate): CallupCriteria {
  return {
    templateId: template.id,
    minAttendanceRate: template.minAttendanceRate,
    slots: template.slots.map((slot) => ({ ...slot, levels: [...slot.levels] })),
    minCoachChildren: template.minCoachChildren,
  };
}

/** Whether two sets of criteria would save the same thing. */
export function criteriaEqual(
  a: CallupCriteria | null,
  b: CallupCriteria | null,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
