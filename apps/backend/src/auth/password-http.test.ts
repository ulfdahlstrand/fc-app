/** Login CSRF: only the SPA's own origin may post to the password routes. */
import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./password-http.js";

describe("isAllowedOrigin", () => {
  const app = "https://fc.example/";

  it("allows the SPA's origin", () => {
    expect(isAllowedOrigin("https://fc.example", app)).toBe(true);
  });

  it("allows a request with no Origin (not a browser, no visitor's cookies)", () => {
    expect(isAllowedOrigin(undefined, app)).toBe(true);
  });

  it.each([
    "https://evil.example",
    "http://fc.example",
    "https://fc.example.evil.example",
    "https://fc.example:8443",
    "null",
  ])("refuses %s", (origin) => {
    expect(isAllowedOrigin(origin, app)).toBe(false);
  });
});
