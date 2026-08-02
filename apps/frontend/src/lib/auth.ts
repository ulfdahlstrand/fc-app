/** Auth helpers for the frontend. */
import type { User } from "@fc-app/contracts";
import { queryClient } from "../query-client";
import { getApiUrl } from "./api-url";
import { orpcQuery } from "./orpc-query";

/** URL that starts the Google sign-in redirect flow. */
export function getGoogleSignInUrl(): string {
  return `${getApiUrl()}/auth/google`;
}

/** Dev-only: whether the OAuth-bypass sign-in button should be shown. */
export function isDevLoginEnabled(): boolean {
  return import.meta.env["VITE_ENABLE_DEV_LOGIN"] === "true";
}

/** Dev-only URL that signs in without Google (backend must also enable it). */
export function getDevSignInUrl(): string {
  return `${getApiUrl()}/auth/dev-login`;
}

export const meQueryOptions = orpcQuery.me.queryOptions({ input: {} });

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
  await queryClient.invalidateQueries({ queryKey: orpcQuery.me.key() });
}
