import { call } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { meHandler } from "./me.js";

const USER = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Alice",
  email: "alice@example.com",
  imageUrl: null,
};

describe("me", () => {
  it("returns the signed-in user from the context", async () => {
    const result = await call(meHandler, {}, { context: { user: USER } });
    expect(result).toEqual({ user: USER });
  });

  it("returns null when signed out", async () => {
    const result = await call(meHandler, {}, { context: { user: null } });
    expect(result).toEqual({ user: null });
  });
});
