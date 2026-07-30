/** Club/team helpers for the frontend. */
import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClubInputSchema } from "@fc-app/contracts";
import type { MyClub, MyTeam, Permission } from "@fc-app/contracts";
import { z } from "zod";
import { queryClient } from "../query-client";
import { requiredText } from "./form";
import { orpcQuery } from "./orpc-query";

export const myClubsQueryOptions = orpcQuery.myClubs.queryOptions({ input: {} });

/**
 * Form schema for onboarding's "create your club" form, derived from the
 * contract's input schema (ADR-007) — the length rules live there, not here.
 * See `lib/form.ts` for the pattern.
 */
export const createClubFormSchema = z.object({
  clubName: requiredText(createClubInputSchema.shape.clubName),
  teamName: requiredText(createClubInputSchema.shape.teamName),
});

/** What the inputs hold while editing (all strings). */
export type CreateClubFormValues = z.input<typeof createClubFormSchema>;

/** What the API accepts, after parsing. */
export type CreateClubInput = z.output<typeof createClubFormSchema>;

/** Fetches (or reuses) the caller's clubs — for route beforeLoad guards. */
export async function ensureMyClubs(): Promise<MyClub[]> {
  const { clubs } = await queryClient.ensureQueryData(myClubsQueryOptions);
  return clubs;
}

// --- Selected team store ----------------------------------------------------

const STORAGE_KEY = "fc-app.selected-team-id";
const listeners = new Set<() => void>();

function getStoredTeamId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function selectTeam(teamId: string): void {
  localStorage.setItem(STORAGE_KEY, teamId);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface SelectedTeam {
  club: MyClub;
  team: MyTeam;
}

/**
 * Resolves the stored selection against the caller's clubs, falling back to
 * the first team of the first club. Null when the user has no team at all.
 */
export function resolveSelectedTeam(
  clubs: MyClub[],
  storedTeamId: string | null
): SelectedTeam | null {
  for (const club of clubs) {
    for (const team of club.teams) {
      if (team.id === storedTeamId) return { club, team };
    }
  }
  const firstClub = clubs.find((club) => club.teams.length > 0);
  const firstTeam = firstClub?.teams[0];
  return firstClub && firstTeam ? { club: firstClub, team: firstTeam } : null;
}

/** The currently selected club/team, or null while loading / without teams. */
export function useSelectedTeam(): SelectedTeam | null {
  const storedTeamId = useSyncExternalStore(subscribe, getStoredTeamId);
  const clubs = useQuery(myClubsQueryOptions);
  if (!clubs.data) return null;
  return resolveSelectedTeam(clubs.data.clubs, storedTeamId);
}

/** True when the caller holds `permission` in the selected team. */
export function useHasPermission(permission: Permission): boolean {
  const selected = useSelectedTeam();
  return selected?.team.permissions.includes(permission) ?? false;
}
