/** Query-string booleans arrive as strings and must coerce. */
import { describe, expect, it } from "vitest";
import { queryBooleanSchema } from "@fc-app/contracts";

/**
 * Regression test for a bug found in manual testing: oRPC's OpenAPI layer
 * does not coerce GET query parameters against the contract's Zod types, so
 * `?includeArchived=false` arrives server-side as the *string* "false", not
 * a boolean — a plain z.boolean() rejects it with BAD_REQUEST. This schema
 * (used by listMembers/listMemberFields' includeArchived) must accept both
 * shapes and must not fall into the classic "any non-empty string is
 * truthy" trap, i.e. the string "false" must normalize to `false`, not `true`.
 */
describe("queryBooleanSchema", () => {
  it("accepts real booleans unchanged", () => {
    expect(queryBooleanSchema.parse(true)).toBe(true);
    expect(queryBooleanSchema.parse(false)).toBe(false);
  });

  it("accepts the 'true'/'false' strings the query-string transport sends", () => {
    expect(queryBooleanSchema.parse("true")).toBe(true);
    expect(queryBooleanSchema.parse("false")).toBe(false);
  });

  it("rejects other strings rather than silently coercing them", () => {
    expect(() => queryBooleanSchema.parse("yes")).toThrow();
    expect(() => queryBooleanSchema.parse("")).toThrow();
  });
});
