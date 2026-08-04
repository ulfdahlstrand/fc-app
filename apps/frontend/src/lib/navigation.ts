/**
 * The app's destinations, in one ordered list.
 *
 * Both shells read this: the desktop `AppHeader` renders every destination the
 * user may see as a pill, and the phone's `TabBar` takes the first four and
 * drops the rest into `MenuSheet`. Kit allows five tabs at most, one of which
 * is always `Menu` — "anything beyond four sections belongs in the sheet, not
 * in a sixth tab" — so the split is a consequence of the order below, not a
 * second list that can drift out of step with this one.
 *
 * Order is deliberate. Overview leads because it is Kit's "Matchday": it
 * already carries today's session, its attendance and the call-up responses.
 * Members, Calendar and Statistics follow as Squad, Schedule and Stats. What
 * falls past the fourth slot is still reachable — a coach's unanswered
 * call-ups raise the alert dot on the `Menu` tab rather than earning one.
 *
 * A player or guardian holds none of the `members.view` permissions, so the
 * same list yields Overview, Call-ups and Noticeboard for them without any
 * role-specific branching.
 */
import type { Permission } from "@fc-app/contracts";

export interface Destination {
  /** Route path, and the identity used to match the active tab. */
  to: string;
  /** Key under `nav` in the locale files. */
  labelKey: string;
  /**
   * Permissions that reveal this destination — holding *any* of them is
   * enough. An empty list means everyone signed in sees it: being announced to
   * needs no permission.
   */
  anyOf: readonly Permission[];
  /** Which `MenuSheet` group it lands in once it falls past the tabs. */
  group: "team" | "club";
}

export const DESTINATIONS: readonly Destination[] = [
  { to: "/", labelKey: "overview", anyOf: [], group: "team" },
  { to: "/members", labelKey: "members", anyOf: ["members.view"], group: "team" },
  {
    to: "/activities",
    labelKey: "activities",
    anyOf: ["members.view"],
    group: "team",
  },
  {
    to: "/statistics",
    labelKey: "statistics",
    anyOf: ["members.view"],
    group: "team",
  },
  // Call-ups are for whoever is asked as well as whoever asks, so this is the
  // one destination a player also sees.
  {
    to: "/callups",
    labelKey: "callups",
    anyOf: ["members.view", "callups.respond"],
    group: "team",
  },
  { to: "/posts", labelKey: "posts", anyOf: [], group: "team" },
  { to: "/groups", labelKey: "groups", anyOf: ["members.view"], group: "team" },
  {
    to: "/tracking",
    labelKey: "tracking",
    anyOf: ["members.view"],
    group: "team",
  },
  {
    to: "/settings/team",
    labelKey: "teamSettings",
    anyOf: ["settings.team"],
    group: "club",
  },
  {
    to: "/settings/club",
    labelKey: "clubSettings",
    anyOf: ["settings.club"],
    group: "club",
  },
];

/** Kit: five tabs at most, and the fifth is always `Menu`. */
export const MAX_TABS = 4;

export function visibleDestinations(
  permissions: readonly Permission[],
): Destination[] {
  return DESTINATIONS.filter(
    (d) => d.anyOf.length === 0 || d.anyOf.some((p) => permissions.includes(p)),
  );
}

/**
 * Splits the visible destinations into the phone's two homes. `tabs` never
 * exceeds `MAX_TABS`; everything else is reachable through the sheet.
 */
export function splitForTabBar(permissions: readonly Permission[]): {
  tabs: Destination[];
  sheet: Destination[];
} {
  const visible = visibleDestinations(permissions);
  return { tabs: visible.slice(0, MAX_TABS), sheet: visible.slice(MAX_TABS) };
}
