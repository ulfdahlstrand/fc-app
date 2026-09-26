/**
 * Email and password sign-in (ADR-024): the calls and the form schemas.
 *
 * The routes are plain JSON POSTs under /auth/password — not oRPC, because
 * they set the session cookie — so they are called with `fetch`. The schemas
 * are the contract's, so a rule is stated once (ADR-010).
 */
import {
  emailTokenSchema,
  passwordForgotInputSchema,
  passwordLoginInputSchema,
  passwordRegisterInputSchema,
  passwordResetInputSchema,
} from "@fc-app/contracts";
import { z } from "zod";
import { queryClient } from "../query-client";
import { getApiUrl } from "./api-url";
import { orpcQuery } from "./orpc-query";

/**
 * Which password flows the API offers. Signing in is always on; registering and
 * resetting by email are off until mail works (ADR-024, ADR-025).
 */
export const authOptionsQueryOptions = orpcQuery.authOptions.queryOptions({
  input: {},
  staleTime: Infinity,
});

/** For the mail-backed password pages' guards: are they reachable at all? */
export async function isPasswordSignupEnabled(): Promise<boolean> {
  const { passwordSignup } = await queryClient.ensureQueryData(
    authOptionsQueryOptions
  );
  return passwordSignup;
}

/** What a failed call is about — each has its own message on screen. */
export type PasswordAuthErrorCode =
  | "invalid_credentials"
  | "invalid_token"
  | "rate_limited"
  | "failed";

export class PasswordAuthError extends Error {
  constructor(readonly code: PasswordAuthErrorCode) {
    super(code);
  }
}

async function post(path: string, body: unknown): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}/auth/password/${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PasswordAuthError("failed");
  }
  if (response.ok) return;

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  const code = payload.error;
  throw new PasswordAuthError(
    code === "invalid_credentials" ||
      code === "invalid_token" ||
      code === "rate_limited"
      ? code
      : "failed"
  );
}

/** After a call that set the session cookie: make the app see the new user. */
async function refreshMe(): Promise<void> {
  await queryClient.resetQueries({ queryKey: orpcQuery.me.key() });
}

export const loginFormSchema = passwordLoginInputSchema;
export type LoginFormValues = z.input<typeof loginFormSchema>;
export type LoginFormOutput = z.output<typeof loginFormSchema>;

export async function loginWithPassword(input: LoginFormOutput): Promise<void> {
  await post("login", input);
  await refreshMe();
}

export const registerFormSchema = passwordRegisterInputSchema
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
  });
export type RegisterFormValues = z.input<typeof registerFormSchema>;
export type RegisterFormOutput = z.output<typeof registerFormSchema>;

export async function registerWithPassword({
  name,
  email,
  password,
}: RegisterFormOutput): Promise<void> {
  await post("register", { name, email, password });
}

export const forgotFormSchema = passwordForgotInputSchema;
export type ForgotFormValues = z.input<typeof forgotFormSchema>;
export type ForgotFormOutput = z.output<typeof forgotFormSchema>;

export async function requestPasswordReset(
  input: ForgotFormOutput
): Promise<void> {
  await post("forgot", input);
}

export const resetFormSchema = passwordResetInputSchema
  .pick({ password: true })
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
  });
export type ResetFormValues = z.input<typeof resetFormSchema>;
export type ResetFormOutput = z.output<typeof resetFormSchema>;

export async function resetPassword(
  token: string,
  password: string
): Promise<void> {
  await post("reset", { token, password });
  await refreshMe();
}

export async function verifyEmail(token: string): Promise<void> {
  await post("verify", { token });
  await refreshMe();
}

/**
 * The token an email link carries. It rides in the fragment (`#token=…`) so it
 * never reaches a server log or a Referer header. Pure, so it is safe in a
 * `useState` initialiser; `clearTokenFromAddressBar` wipes it afterwards.
 */
export function readTokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return token !== null && emailTokenSchema.safeParse(token).success
    ? token
    : null;
}

/** Keeps a used link's token out of the browser history. */
export function clearTokenFromAddressBar(): void {
  if (!globalThis.location.hash) return;
  history.replaceState(
    history.state,
    "",
    globalThis.location.pathname + globalThis.location.search
  );
}
