/**
 * Auth helpers for the frontend.
 *
 * The single source of truth for "who am I" is the backend `me` procedure,
 * cached under the ["me"] query key. Route guards call ensureMe() in
 * beforeLoad; components subscribe with useQuery(meQueryOptions).
 */
import { queryOptions } from "@tanstack/react-query";
import type { User } from "@fc-app/contracts";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";

export function getApiUrl(): string {
  return import.meta.env["VITE_API_URL"] ?? "";
}

/** URL that starts the Google sign-in redirect flow. */
export function getGoogleSignInUrl(): string {
  return `${getApiUrl()}/auth/google`;
}

export const meQueryOptions = queryOptions({
  queryKey: ["me"],
  queryFn: () => orpc.me({}),
});

/** Fetches (or reuses) the current user — for route beforeLoad guards. */
export async function ensureMe(): Promise<User | null> {
  const { user } = await queryClient.ensureQueryData(meQueryOptions);
  return user;
}

/** Ends the session on the backend and clears the cached auth state. */
export async function logout(): Promise<void> {
  await fetch(`${getApiUrl()}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  await queryClient.invalidateQueries({ queryKey: ["me"] });
}
