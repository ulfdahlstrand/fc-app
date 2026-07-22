/**
 * The member form schema is what the create/edit dialog validates against, and
 * it is derived from the contract's write fields (ADR-007). These tests pin the
 * string-input → API-payload conversion the form helpers perform.
 */
import { describe, expect, it } from "vitest";
import { memberFormSchema } from "./members";

const valid = {
  firstName: "Alva",
  lastName: "Nilsson",
  birthYear: "2014",
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
