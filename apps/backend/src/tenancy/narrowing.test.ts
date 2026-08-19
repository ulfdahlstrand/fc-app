import { describe, expect, it } from "vitest";
import type { Permission } from "@fc-app/contracts";
import { isDemotion, narrowsAccess } from "./narrowing.js";

const COACH: Permission[] = [
  "members.view",
  "members.manage",
  "activities.manage",
  "attendance.record",
];
const ADMIN: Permission[] = [...COACH, "settings.club"];
const PLAYER: Permission[] = ["callups.respond"];

describe("narrowsAccess", () => {
  it("is false for the same set", () => {
    expect(narrowsAccess(COACH, COACH)).toBe(false);
  });

  it("is false when the new role only adds", () => {
    expect(narrowsAccess(PLAYER, [...PLAYER, ...COACH])).toBe(false);
  });

  it("is true when the new role drops a permission", () => {
    expect(narrowsAccess(ADMIN, COACH)).toBe(true);
  });

  it("is true when the sets merely overlap", () => {
    expect(narrowsAccess(PLAYER, COACH)).toBe(true);
  });

  it("is false when there is nothing to lose", () => {
    expect(narrowsAccess([], COACH)).toBe(false);
  });
});

describe("isDemotion", () => {
  it("is true for an admin handed the coach role", () => {
    expect(isDemotion(ADMIN, COACH)).toBe(true);
  });

  it("is false for a player handed the coach role", () => {
    // Loses callups.respond, gains the coaching set: a change, not a demotion.
    expect(isDemotion(PLAYER, COACH)).toBe(false);
  });

  it("is false for the same set", () => {
    expect(isDemotion(COACH, COACH)).toBe(false);
  });

  it("is false when there is nothing to lose", () => {
    expect(isDemotion([], COACH)).toBe(false);
  });
});
