/** Invitation status: used, revoked and expired take precedence in that order. */
import { describe, expect, it } from "vitest";
import { invitationStatus } from "./status.js";

const NOW = new Date("2026-07-18T12:00:00Z");
const FUTURE = new Date("2026-07-25T12:00:00Z");
const PAST = new Date("2026-07-10T12:00:00Z");

describe("invitationStatus", () => {
  it("is active when unused, unrevoked, and not expired", () => {
    expect(
      invitationStatus(
        { expiresAt: FUTURE, usedAt: null, revokedAt: null },
        NOW
      )
    ).toEqual("active");
  });

  it("is expired past the expiry", () => {
    expect(
      invitationStatus({ expiresAt: PAST, usedAt: null, revokedAt: null }, NOW)
    ).toEqual("expired");
  });

  it("is used once consumed", () => {
    expect(
      invitationStatus({ expiresAt: FUTURE, usedAt: NOW, revokedAt: null }, NOW)
    ).toEqual("used");
  });

  it("is revoked, taking precedence over used and expired", () => {
    expect(
      invitationStatus({ expiresAt: PAST, usedAt: NOW, revokedAt: NOW }, NOW)
    ).toEqual("revoked");
  });

  it("treats the exact expiry instant as expired", () => {
    expect(
      invitationStatus({ expiresAt: NOW, usedAt: null, revokedAt: null }, NOW)
    ).toEqual("expired");
  });
});
