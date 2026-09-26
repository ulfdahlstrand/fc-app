/** The signed-in user, or null — and which ways in the login page offers. */
import { canSendMail } from "../auth/mailer.js";
import { os } from "../orpc.js";

/**
 * Returns the signed-in user from the request context, or null when the
 * request carries no valid session. Never throws — the frontend uses this
 * to decide between the app and the login page.
 */
export const meHandler = os.me.handler(async ({ context }) => {
  return { user: context.user };
});

/** Public, like `me`: the login page asks before anybody is signed in. */
export const authOptionsHandler = os.authOptions.handler(async () => {
  return { passwordSignup: canSendMail() };
});
