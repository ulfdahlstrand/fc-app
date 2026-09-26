/**
 * Site administration (ADR-025, ADR-026): creating an account outright, and
 * the list of every account with the password of one of them.
 */
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  siteAdminCreateUserInputSchema,
  siteAdminSetPasswordInputSchema,
} from "@fc-app/contracts";
import { z } from "zod";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";
import { orpcQuery } from "./orpc-query";

/** The select's stand-in for "no team": Radix refuses an empty item value. */
export const CLUB_WIDE = "club-wide";

/**
 * The contract's rules for name, address and password, with the team as the
 * select holds it. Club and role come from the page, so they are not typed in.
 */
export const createUserFormSchema = siteAdminCreateUserInputSchema
  .pick({ name: true, email: true, password: true })
  .extend({
    roleId: z.string().min(1),
    teamId: z
      .string()
      .transform((value) => (value === CLUB_WIDE ? null : value)),
  });

export type CreateUserFormValues = z.input<typeof createUserFormSchema>;
export type CreateUserFormOutput = z.output<typeof createUserFormSchema>;

export function useSiteAdminClub(clubId: string) {
  return useQuery(
    orpcQuery.siteAdminClub.queryOptions({ input: { clubId } })
  );
}

export function useCreateUser(clubId: string) {
  return useMutation({
    mutationFn: (input: CreateUserFormOutput) =>
      orpc.siteAdminCreateUser({ clubId, ...input }),
    onSuccess: async () => {
      await Promise.all([
        // The new account may hold a role in a team the admin is looking at.
        queryClient.invalidateQueries({ queryKey: orpcQuery.myClubs.key() }),
        // And it belongs in the list below the form straight away — otherwise
        // the account just created is the one account that is not on screen.
        queryClient.invalidateQueries({
          queryKey: orpcQuery.siteAdminUsers.key(),
        }),
      ]);
    },
  });
}

/** Names the one failure worth naming: the address already has an account. */
export function createUserErrorKey(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : null;
  return code === "CONFLICT"
    ? "siteAdmin.errors.emailTaken"
    : "siteAdmin.errors.failed";
}

// ---------------------------------------------------------------------------
// The account list, and replacing a password (ADR-026).
// ---------------------------------------------------------------------------

/**
 * Every account in the installation, narrowed by a search over name and
 * address. The previous answer stays on screen while a new one loads, so the
 * list does not blink away under someone who is still typing.
 */
export function useSiteAdminUsers(search: string) {
  return useQuery({
    ...orpcQuery.siteAdminUsers.queryOptions({
      input: { search: search.trim() },
    }),
    placeholderData: keepPreviousData,
  });
}

/** The password field alone: the account comes from the row that was clicked. */
export const setPasswordFormSchema = siteAdminSetPasswordInputSchema.pick({
  password: true,
});

export type SetPasswordFormValues = z.input<typeof setPasswordFormSchema>;

export function useSetPassword() {
  return useMutation({
    mutationFn: (input: { userId: string; password: string }) =>
      orpc.siteAdminSetPassword(input),
    // An activated account now has a password, and the list is what the next
    // reset is chosen from, so keep it fresh.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: orpcQuery.siteAdminUsers.key() }),
  });
}

/**
 * Names the refusal that is worth explaining: the account signs in with Google
 * only, so there is no password to replace (ADR-026, ADR-027). The button for such a row
 * is disabled, so this is the belt to that braces.
 */
export function setPasswordErrorKey(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : null;
  return code === "CONFLICT"
    ? "siteAdmin.errors.noPassword"
    : "siteAdmin.errors.passwordFailed";
}
