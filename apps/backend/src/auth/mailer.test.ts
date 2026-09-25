/** Email and password sign-in is only offered where its mail can arrive. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { canSendMail } from "./mailer.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

function env(values: Record<string, string>) {
  for (const key of ["NODE_ENV", "RESEND_API_KEY", "MAIL_FROM"]) {
    vi.stubEnv(key, values[key] ?? "");
  }
}

describe("canSendMail", () => {
  it("is on outside production, where mail goes to the console", () => {
    env({ NODE_ENV: "development" });
    expect(canSendMail()).toBe(true);
  });

  it("is off in production with nothing configured", () => {
    env({ NODE_ENV: "production" });
    expect(canSendMail()).toBe(false);
  });

  it("is off in production with only half the setup", () => {
    env({ NODE_ENV: "production", RESEND_API_KEY: "re_123" });
    expect(canSendMail()).toBe(false);
    env({ NODE_ENV: "production", MAIL_FROM: "FC <no@club.se>" });
    expect(canSendMail()).toBe(false);
  });

  it("is on in production once both are set", () => {
    env({
      NODE_ENV: "production",
      RESEND_API_KEY: "re_123",
      MAIL_FROM: "FC <no@club.se>",
    });
    expect(canSendMail()).toBe(true);
  });
});
