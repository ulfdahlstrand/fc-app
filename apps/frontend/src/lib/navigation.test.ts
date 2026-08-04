/**
 * The tab bar is derived, not configured: one ordered destination list is
 * filtered by permission and the first four survive as tabs. These tests pin
 * the two roles that shaped the order — a coach and a guardian — plus Kit's
 * hard rule that a phone never shows more than four sections beside `Menu`.
 */
import { describe, expect, it } from "vitest";
import type { Permission } from "@fc-app/contracts";
import {
  DESTINATIONS,
  MAX_TABS,
  splitForTabBar,
  visibleDestinations,
} from "./navigation";

/** A coach: sees the roster, runs sessions, records attendance. */
const coach: Permission[] = [
  "members.view",
  "activities.manage",
  "attendance.record",
  "callups.manage",
];

/** A guardian: answers call-ups for their child, and nothing else. */
const guardian: Permission[] = ["callups.respond"];

describe("splitForTabBar", () => {
  it("gives a coach Overview, Members, Calendar and Statistics", () => {
    const { tabs } = splitForTabBar(coach);

    expect(tabs.map((d) => d.labelKey)).toEqual([
      "overview",
      "members",
      "activities",
      "statistics",
    ]);
  });

  it("drops a coach's remaining destinations into the sheet", () => {
    const { sheet } = splitForTabBar(coach);

    // Call-ups earn the alert dot on Menu rather than a fifth tab.
    expect(sheet.map((d) => d.labelKey)).toContain("callups");
    expect(sheet.map((d) => d.labelKey)).toContain("posts");
  });

  it("leaves a guardian with the destinations they can actually reach", () => {
    const { tabs, sheet } = splitForTabBar(guardian);

    // No role-specific branching produced this — the same list did.
    expect(tabs.map((d) => d.labelKey)).toEqual([
      "overview",
      "callups",
      "posts",
    ]);
    expect(sheet).toEqual([]);
  });

  it("never offers more than four tabs, whatever the user holds", () => {
    const everything: Permission[] = [
      "members.view",
      "members.manage",
      "members.import",
      "activities.manage",
      "attendance.record",
      "callups.manage",
      "callups.respond",
      "posts.manage",
      "tracking.manage",
      "settings.team",
      "settings.club",
    ];

    const { tabs, sheet } = splitForTabBar(everything);

    expect(tabs).toHaveLength(MAX_TABS);
    expect(tabs.length + sheet.length).toBe(DESTINATIONS.length);
  });
});

describe("visibleDestinations", () => {
  it("shows the noticeboard to everyone signed in", () => {
    // Being announced to needs no permission.
    expect(visibleDestinations([]).map((d) => d.labelKey)).toEqual([
      "overview",
      "posts",
    ]);
  });

  it("reveals a destination on any one of its permissions", () => {
    // Call-ups are for whoever asks as well as whoever is asked.
    const asker = visibleDestinations(["members.view"]);
    const asked = visibleDestinations(["callups.respond"]);

    expect(asker.map((d) => d.to)).toContain("/callups");
    expect(asked.map((d) => d.to)).toContain("/callups");
  });

  it("keeps club settings out of a team-only admin's list", () => {
    const teamAdmin = visibleDestinations(["members.view", "settings.team"]);

    expect(teamAdmin.map((d) => d.to)).toContain("/settings/team");
    expect(teamAdmin.map((d) => d.to)).not.toContain("/settings/club");
  });
});
