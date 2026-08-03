/**
 * The member form schema is what the create/edit dialog validates against, and
 * it is derived from the contract's write fields (ADR-007). These tests pin the
 * string-input → API-payload conversion the form helpers perform.
 */
import { describe, expect, it } from "vitest";
import { editablePersonalId, memberFormSchema } from "./members";

const valid = {
  firstName: "Alva",
  lastName: "Nilsson",
  birthYear: "2014",
  personalId: "",
  email: "alva@example.com",
  phone: "070-123 45 67",
};

describe("memberFormSchema", () => {
  it("trims text and parses the birth year", () => {
    const result = memberFormSchema.parse({ ...valid, firstName: "  Alva  " });

    expect(result).toEqual({
      firstName: "Alva",
      lastName: "Nilsson",
      birthYear: 2014,
      personalId: null,
      email: "alva@example.com",
      phone: "070-123 45 67",
    });
  });

  it("maps blank optional inputs to null", () => {
    const result = memberFormSchema.parse({
      ...valid,
      birthYear: "  ",
      email: "",
      phone: "",
    });

    expect(result.birthYear).toBeNull();
    expect(result.email).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.personalId).toBeNull();
  });

  it("checks the personnummer before it becomes a round trip (ADR-022)", () => {
    const valid1985 = memberFormSchema.safeParse({
      ...valid,
      personalId: "19850822-3578",
    });
    const badCheckDigit = memberFormSchema.safeParse({
      ...valid,
      personalId: "19850822-3579",
    });

    expect(valid1985.success).toBe(true);
    expect(badCheckDigit.success).toBe(false);
    expect(badCheckDigit.error?.issues[0]?.path[0]).toBe("personalId");
  });

  it("requires a first and last name", () => {
    const result = memberFormSchema.safeParse({
      ...valid,
      firstName: "   ",
      lastName: "",
    });

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.map((issue) => [issue.path[0], issue.code]),
    ).toEqual([
      ["firstName", "too_small"],
      ["lastName", "too_small"],
    ]);
  });

  it("enforces the contract's birth year range and email format", () => {
    const tooEarly = memberFormSchema.safeParse({ ...valid, birthYear: "1800" });
    const notANumber = memberFormSchema.safeParse({
      ...valid,
      birthYear: "nope",
    });
    const badEmail = memberFormSchema.safeParse({ ...valid, email: "alva@" });

    expect(tooEarly.error?.issues[0]?.code).toBe("too_small");
    expect(notANumber.error?.issues[0]?.code).toBe("invalid_type");
    expect(badEmail.error?.issues[0]?.code).toBe("invalid_format");
  });
});

describe("editablePersonalId", () => {
  it("hands back a full number for editing", () => {
    expect(editablePersonalId("20170314-2412")).toBe("20170314-2412");
  });

  // A members.view caller sees a masked number; it must never be typed back in
  // as if it were a real one.
  it("refuses to prefill a masked number", () => {
    expect(editablePersonalId("20170314-****")).toBe("");
    expect(editablePersonalId(null)).toBe("");
  });
});
