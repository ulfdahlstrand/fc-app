/**
 * The activity form schema is what the create/edit dialog validates against,
 * derived from the contract's write fields (ADR-007). These tests pin the
 * string-input → API-payload conversion, which for a calendar is the part that
 * bites: `<input type="datetime-local">` carries no timezone at all.
 */
import { describe, expect, it } from "vitest";
import { activityFormSchema } from "./activities";
import { toDateTimeInput } from "./dates";

const TYPE_ID = "550e8400-e29b-41d4-a716-446655440000";

const valid = {
  activityTypeId: TYPE_ID,
  title: "vs. Skiljebo SK",
  startsAt: "2026-08-01T17:30",
  endsAt: "2026-08-01T19:00",
  location: "Vallby IP 2",
  notes: "Samling 17:00",
};

describe("activityFormSchema", () => {
  it("resolves the local wall time to an instant and trims text", () => {
    const result = activityFormSchema.parse({
      ...valid,
      title: "  vs. Skiljebo SK  ",
    });

    expect(result.title).toBe("vs. Skiljebo SK");
    expect(result.location).toBe("Vallby IP 2");
    // Local in, instant out — and back to the same wall time on screen.
    expect(toDateTimeInput(result.startsAt)).toBe("2026-08-01T17:30");
    expect(toDateTimeInput(result.endsAt!)).toBe("2026-08-01T19:00");
  });

  it("treats a blank end as open-ended, not as invalid", () => {
    const result = activityFormSchema.parse({ ...valid, endsAt: "" });

    expect(result.endsAt).toBeNull();
  });

  it("maps the other blank optional inputs to null", () => {
    const result = activityFormSchema.parse({
      ...valid,
      title: "",
      location: "  ",
      notes: "",
    });

    expect(result.title).toBeNull();
    expect(result.location).toBeNull();
    expect(result.notes).toBeNull();
  });

  it("requires a type and a start time", () => {
    const result = activityFormSchema.safeParse({
      ...valid,
      activityTypeId: "",
      startsAt: "",
    });

    expect(result.success).toBe(false);
    const fields = result.error?.issues.map((issue) => issue.path[0]);
    expect(fields).toContain("activityTypeId");
    expect(fields).toContain("startsAt");
  });

  it("rejects an end that precedes its start, on the endsAt field", () => {
    const result = activityFormSchema.safeParse({
      ...valid,
      endsAt: "2026-08-01T16:00",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["endsAt"]);
  });
});
