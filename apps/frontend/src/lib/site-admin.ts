/** Site administration (ADR-025): creating an account outright. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { siteAdminCreateUserInputSchema } from "@fc-app/contracts";
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
    // The new account may hold a role in a team the admin is looking at.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: orpcQuery.myClubs.key() }),
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
