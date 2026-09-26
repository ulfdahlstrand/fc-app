/** Accounts and the current session. Google sign-in is a browser redirect flow (ADR-004); email and password are plain JSON routes (ADR-024). */

import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  imageUrl: z.string().nullable(),
  /** Runs the installation, above every club (ADR-025). */
  isSiteAdmin: z.boolean(),
});

export type User = z.infer<typeof userSchema>;

export const meInputSchema = z.object({});

export const meOutputSchema = z.object({
  user: userSchema.nullable(),
});

/** Which ways in the login page may offer. Public: asked before sign-in. */
export const authOptionsInputSchema = z.object({});

export const authOptionsOutputSchema = z.object({
  /**
   * Registering and resetting a password by email (ADR-024). Off until the API
   * can send mail — a signup whose confirmation never arrives is a dead end, so
   * it is not offered. Signing in with a password that already exists needs no
   * mail and is always offered (ADR-025).
   */
  passwordSignup: z.boolean(),
});


// ---------------------------------------------------------------------------
// Email and password sign-in (ADR-024). These travel over plain HTTP routes
// under /auth/password, not oRPC, because they set the session cookie — but
// the rules are stated here once, for the backend and the forms alike.
// ---------------------------------------------------------------------------

/**
 * Lowercased and trimmed, because every place the app matches an address —
 * invitations, coaches, contacts — compares case-insensitively.
 */
export const accountEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));

/**
 * Length is the rule that matters (NIST SP 800-63B): at least 10, and no
 * composition rules. The ceiling only bounds the work a single request can
 * cause; it is far above any passphrase a person types.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH);

/** An opaque single-use token from an email link. */
export const emailTokenSchema = z.string().min(20).max(200);

export const passwordRegisterInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: accountEmailSchema,
  password: passwordSchema,
});

export const passwordLoginInputSchema = z.object({
  email: accountEmailSchema,
  // Not `passwordSchema`: a rule tightened later must not lock out an account
  // whose password was fine when it was set. Only the ceiling applies.
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const passwordForgotInputSchema = z.object({
  email: accountEmailSchema,
});

export const passwordResetInputSchema = z.object({
  token: emailTokenSchema,
  password: passwordSchema,
});

export const emailVerifyInputSchema = z.object({
  token: emailTokenSchema,
});

export type PasswordRegisterInput = z.infer<typeof passwordRegisterInputSchema>;
export type PasswordLoginInput = z.infer<typeof passwordLoginInputSchema>;
export type PasswordForgotInput = z.infer<typeof passwordForgotInputSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetInputSchema>;
