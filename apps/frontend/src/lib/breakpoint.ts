/**
 * Kit's one breakpoint, in TypeScript.
 *
 * Most of the mobile work is a CSS concern and belongs in a `kit:` variant.
 * This hook is for the cases the adapt matrix calls a **swap** rather than an
 * adjust — where a phone builds the screen from different components, not the
 * same ones restyled. Rendering both and hiding one with CSS would put the
 * losing tree in the DOM for screen readers and for every keyboard user, which
 * is worse than the branch.
 *
 * The 700 mirrors `--bp-desktop-min` in `globals.css`. It is duplicated
 * because a media query cannot be built from a custom property; if one moves,
 * move the other.
 */
import { useSyncExternalStore } from "react";

const PHONE_QUERY = "(max-width: 699px)";

const query = () => window.matchMedia(PHONE_QUERY);

function subscribe(onChange: () => void): () => void {
  const list = query();
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/** True below Kit's breakpoint — the phone shell, not the desktop one. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => query().matches,
    // Nothing server-renders today; if that changes, the desktop shell is the
    // safer guess, since it degrades to a scrollable table rather than hiding
    // columns a user was told existed.
    () => false,
  );
}
