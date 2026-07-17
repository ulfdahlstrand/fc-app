/**
 * Club/team helpers for the frontend.
 *
 * `myClubs` (cached under ["myClubs"]) drives the onboarding redirect and
 * the club/team switcher. The selected team is kept in a tiny external
 * store backed by localStorage so any component can subscribe via
 * useSelectedTeam() and the choice survives reloads.
 */
import { queryOptions } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MyClub, Team } from "@fc-app/contracts";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";

export const myClubsQueryOptions = queryOptions({
  queryKey: ["myClubs"],
  queryFn: () => orpc.myClubs({}),
});

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
  team: Team;
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
