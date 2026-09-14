/**
 * The settings menu is derived, not configured: one ordered section list is
 * filtered by permission. These tests pin the coach/admin split — appointing
 * coaches is an admin's call, the rest is the coach's own — and the slug
 * resolution the URL depends on.
 */
import { describe, expect, it } from "vitest";
import type { Permission } from "@fc-app/contracts";
import {
  TEAM_SETTINGS_SECTIONS,
  resolveTeamSettingsSection,
  visibleTeamSettingsSections,
} from "./team-settings";

/** A coach who configures their own team, but administers no club. */
const coach: Permission[] = ["members.view", "settings.team"];

/** A club admin, who may also appoint coaches. */
const admin: Permission[] = [...coach, "settings.club"];

describe("visibleTeamSettingsSections", () => {
  it("hides the coaches section from a coach", () => {
    const ids = visibleTeamSettingsSections(coach).map((s) => s.id);

    expect(ids).not.toContain("coaches");
    expect(ids).toEqual([
      "activity-types",
      "attendance-statuses",
      "seasons",
      "members",
      "member-fields",
      "tracking",
      "development",
    ]);
  });

  it("gives an admin every section, coaches first", () => {
    const ids = visibleTeamSettingsSections(admin).map((s) => s.id);

    expect(ids[0]).toBe("coaches");
    expect(ids).toHaveLength(TEAM_SETTINGS_SECTIONS.length);
  });

  it("keeps the ids unique, since they are the URL", () => {
    const ids = TEAM_SETTINGS_SECTIONS.map((s) => s.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("resolveTeamSettingsSection", () => {
  it("resolves a slug the caller may see", () => {
    expect(resolveTeamSettingsSection("seasons", coach)?.labelKey).toBe(
      "seasons.heading",
    );
  });

  it("returns null for no slug at all", () => {
    expect(resolveTeamSettingsSection(undefined, admin)).toBeNull();
  });

  it("returns null for a slug from an older link", () => {
    expect(resolveTeamSettingsSection("not-a-section", admin)).toBeNull();
  });

  it("returns null for a section the caller may not see", () => {
    expect(resolveTeamSettingsSection("coaches", coach)).toBeNull();
    expect(resolveTeamSettingsSection("coaches", admin)).not.toBeNull();
  });
});
