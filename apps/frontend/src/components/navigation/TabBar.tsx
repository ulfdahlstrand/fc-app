/**
 * The phone's primary navigation (Kit `TabBar`). Sits on the bottom edge and
 * never scrolls — a coach marking attendance in the rain must not have to
 * scroll to find their way out of a screen.
 *
 * Text only: Kit has no icon set, and a text tab bar is honest about it. The
 * active tab fills brand green, the same "this one is live" fill `NavPill`
 * uses on ink, so the two read as one family.
 *
 * Five items maximum, the fifth being `Menu` — see `lib/navigation.ts` for the
 * split. An `alert` dot is orange and means a person must act; it disappears
 * while the tab is active.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Kit specifies 10.5px at +0.7px tracking with a little horizontal padding —
 * numbers derived for its own four labels, which are single short words
 * (Matchday, Squad, Schedule, Stats). This app's nouns are longer
 * ("Statistics", "Medlemmar"), and at 390px the longest overruns its pill by a
 * few pixels. Kit's overriding rule decides it: a word is never truncated, and
 * shortening is done in the data, not with CSS. Since renaming the app's
 * destinations is not this layer's call, the tracking and padding give way
 * instead — the type size, which is what makes the bar legible, does not.
 */
const tabClass =
  // `flex-auto`, not `flex-1`: equal columns would size every tab to the
  // longest word and clip it on a 320px phone, while "Menu" sat on 22px of
  // slack. Sizing from content lets the short tab hand that slack over.
  "relative flex h-tap-tab flex-auto items-center justify-center rounded-pill px-0.5 text-[10.5px] tracking-[0.3px] whitespace-nowrap uppercase transition-colors duration-[120ms] ease-standard";
const tabIdle = "font-semibold text-neutral-500";
const tabActive = "bg-brand font-bold text-white";

function AlertDot() {
  return (
    <span
      aria-hidden
      className="bg-destructive absolute top-[9px] right-[10px] size-[7px] rounded-full"
    />
  );
}

export function TabBarLink({
  to,
  exact,
  alert,
  children,
}: {
  to: string;
  exact: boolean;
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      // Without this "/" would count as active on every page, since prefix
      // matching makes the root a prefix of all of them.
      activeOptions={{ exact }}
      className={cn(tabClass, tabIdle)}
      activeProps={{ className: cn(tabClass, tabActive) }}
      inactiveProps={{ className: cn(tabClass, tabIdle) }}
    >
      {({ isActive }) => (
        <>
          {children}
          {alert && !isActive && <AlertDot />}
        </>
      )}
    </Link>
  );
}

export function TabBarButton({
  onClick,
  active,
  alert,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={active}
      className={cn(tabClass, active ? tabActive : tabIdle)}
    >
      {children}
      {alert && !active && <AlertDot />}
    </button>
  );
}

export function TabBar({ children }: { children: ReactNode }) {
  return (
    <nav
      // `flex-none` is load-bearing: a bar inside a column flex that is allowed
      // to shrink resolves its height against the scrolling sibling and
      // collapses.
      className="bg-ink flex flex-none flex-col gap-2 px-[10px] pt-2"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="flex gap-0.5">{children}</div>
    </nav>
  );
}
