/**
 * The team settings page's sections, in one ordered list.
 *
 * The page used to be a single stack of seven configuration sections, roughly
 * 2500 lines of component rendered at once: finding "Utvecklingsmått" meant
 * scrolling past every field, season and tracking list first. The list below
 * turns that stack into a menu — the desktop shell draws it as a column beside
 * the content, the phone as the page itself with the section behind it — so
 * exactly one section is on screen at a time and the others are one click away.
 *
 * `id` is the URL slug (`/settings/team?section=seasons`), which makes a
 * section linkable and survives a reload. `labelKey` reuses each section's own
 * heading key, so the menu row and the heading it leads to cannot drift apart.
 *
 * Every section needs `settings.team`, which the page itself gates on; the
 * optional `requires` is for the one section that needs more than that.
 */
import type { Permission } from "@fc-app/contracts";

export interface TeamSettingsSection {
  /** URL slug, and the identity used to match the active row. */
  id: string;
  /** The section heading's own translation key. */
  labelKey: string;
  /**
   * A permission needed *beyond* `settings.team`, or null when the page's own
   * gate is enough.
   */
  requires: Permission | null;
}

export const TEAM_SETTINGS_SECTIONS: readonly TeamSettingsSection[] = [
  // Appointing coaches grants access to the club, which is an admin's call
  // however narrow the grant — so it is not shown to the coach whose other
  // settings these are.
  {
    id: "coaches",
    labelKey: "settings.team.coaches",
    requires: "settings.club",
  },
  {
    id: "activity-types",
    labelKey: "settings.team.activityTypes",
    requires: null,
  },
  {
    id: "attendance-statuses",
    labelKey: "attendanceStatuses.heading",
    requires: null,
  },
  { id: "seasons", labelKey: "seasons.heading", requires: null },
  // Adding a member and inviting imported guardians. The section gates its
  // own two buttons (`members.manage`, `settings.club`), so a coach who holds
  // neither still sees where the roster's configuration lives.
  { id: "members", labelKey: "settings.team.members", requires: null },
  { id: "member-fields", labelKey: "settings.team.fields", requires: null },
  { id: "tracking", labelKey: "settings.team.tracking", requires: null },
  { id: "development", labelKey: "settings.team.development", requires: null },
];

export function visibleTeamSettingsSections(
  permissions: readonly Permission[],
): TeamSettingsSection[] {
  return TEAM_SETTINGS_SECTIONS.filter(
    (section) =>
      section.requires === null || permissions.includes(section.requires),
  );
}

/**
 * The section a `?section=` slug names, or null.
 *
 * Null covers three cases the page treats alike — no slug, a slug from an
 * older link, and a slug the caller may not see. On a phone that lands on the
 * menu, which is where someone with no section in mind wants to be anyway; on
 * the desktop the caller picks a default rather than showing an empty column.
 */
export function resolveTeamSettingsSection(
  id: string | undefined,
  permissions: readonly Permission[],
): TeamSettingsSection | null {
  if (id === undefined) return null;
  return visibleTeamSettingsSections(permissions).find((s) => s.id === id)
    ?? null;
}
