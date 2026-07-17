import { call } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { healthHandler } from "./health.js";

describe("health", () => {
  it("returns status ok without echo", async () => {
    const result = await call(healthHandler, {}, { context: { user: null } });
    expect(result).toEqual({ status: "ok" });
  });

  it("echoes the input back", async () => {
    const result = await call(
      healthHandler,
      { echo: "hej" },
      { context: { user: null } }
    );
    expect(result).toEqual({ status: "ok", echo: "hej" });
  });
});
