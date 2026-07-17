import { os } from "../orpc.js";

/**
 * Returns the signed-in user from the request context, or null when the
 * request carries no valid session. Never throws — the frontend uses this
 * to decide between the app and the login page.
 */
export const meHandler = os.me.handler(async ({ context }) => {
  return { user: context.user };
});
