// @vitest-environment happy-dom — the picked-field selection lives in localStorage.
import { beforeEach, describe, expect, it } from "vitest";
import type { Member, MemberFieldDefinition } from "@fc-app/contracts";
import {
  commitFieldValue,
  filledCount,
  listFields,
  moveField,
  pickedFieldsKey,
  readPickedFieldIds,
  visibleFields,
  writePickedFieldIds,
} from "./member-field-view";

function field(
  id: string,
  overrides: Partial<MemberFieldDefinition> = {}
): MemberFieldDefinition {
  return {
    id,
    teamId: "team-1",
    name: id,
    fieldType: "text",
    options: [],
    required: false,
    sortOrder: 0,
    showInList: true,
    archived: false,
    ...overrides,
  };
}

function member(customFields: Record<string, string>): Pick<Member, "customFields"> {
  return { customFields };
}

describe("listFields", () => {
  it("drops the fields the team keeps off the list", () => {
    const fields = [
      field("a"),
      field("b", { showInList: false }),
      field("c"),
    ];
    expect(listFields(fields).map((one) => one.id)).toEqual(["a", "c"]);
  });

  it("leaves the order alone", () => {
    const fields = [field("c"), field("a"), field("b")];
    expect(listFields(fields).map((one) => one.id)).toEqual(["c", "a", "b"]);
  });
});

describe("moveField", () => {
  const fields = [field("a"), field("b"), field("c")];

  it("swaps a field with the one above it", () => {
    expect(moveField(fields, 2, -1)).toEqual(["a", "c", "b"]);
  });

  it("swaps a field with the one below it", () => {
    expect(moveField(fields, 0, 1)).toEqual(["b", "a", "c"]);
  });

  // The caller compares against the current ids and skips the request, so
  // "unchanged" is the contract, not a thrown error.
  it("leaves the order alone at either end", () => {
    expect(moveField(fields, 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveField(fields, 2, 1)).toEqual(["a", "b", "c"]);
  });
});

describe("visibleFields", () => {
  const fields = [field("a"), field("b"), field("c")];

  it("shows every field when nothing has been stored", () => {
    expect(visibleFields(null, fields).map((one) => one.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("keeps an empty choice empty rather than resetting it", () => {
    expect(visibleFields([], fields)).toEqual([]);
  });

  it("drops stored ids that no longer resolve", () => {
    // An archived field is absent from `useMemberFields`, and a stale id must
    // never reach the server.
    expect(visibleFields(["a", "archived-one"], fields).map((f) => f.id)).toEqual(
      ["a"]
    );
  });

  it("orders by the definitions, not by what was stored", () => {
    expect(visibleFields(["c", "a"], fields).map((one) => one.id)).toEqual([
      "a",
      "c",
    ]);
  });
});

describe("the stored selection", () => {
  beforeEach(() => localStorage.clear());

  it("is null before anything is chosen, and per team", () => {
    writePickedFieldIds("team-1", ["a"]);
    expect(readPickedFieldIds("team-1")).toEqual(["a"]);
    expect(readPickedFieldIds("team-2")).toBeNull();
  });

  it("keeps an empty choice apart from no choice", () => {
    writePickedFieldIds("team-1", []);
    expect(readPickedFieldIds("team-1")).toEqual([]);
  });

  it("treats an unreadable value as nothing stored", () => {
    localStorage.setItem(pickedFieldsKey("team-1"), "not json");
    expect(readPickedFieldIds("team-1")).toBeNull();
    localStorage.setItem(pickedFieldsKey("team-1"), '{"a":1}');
    expect(readPickedFieldIds("team-1")).toBeNull();
  });
});

describe("commitFieldValue", () => {
  it("does not write when nothing was edited", () => {
    expect(commitFieldValue(field("a"), "Blå", "Blå")).toEqual({
      action: "none",
    });
  });

  it("does not write when a blank cell is left blank", () => {
    expect(commitFieldValue(field("a"), "   ", "")).toEqual({ action: "none" });
  });

  it("clears a filled cell that was emptied", () => {
    expect(commitFieldValue(field("a"), "", "Blå")).toEqual({
      action: "save",
      value: null,
    });
  });

  it("refuses an invalid number, naming the type as the reason", () => {
    const number = field("a", { fieldType: "number" });
    expect(commitFieldValue(number, "12,5 kg", "")).toEqual({
      action: "invalid",
      fieldType: "number",
    });
  });

  it("refuses a half-typed date", () => {
    const date = field("a", { fieldType: "date" });
    expect(commitFieldValue(date, "2026-08", "")).toEqual({
      action: "invalid",
      fieldType: "date",
    });
  });

  it("refuses an option the field does not offer", () => {
    const select = field("a", { fieldType: "select", options: ["S", "M"] });
    expect(commitFieldValue(select, "XL", "")).toEqual({
      action: "invalid",
      fieldType: "select",
    });
  });

  it("compares the normalised value, so 7.0 over 7 is not a write", () => {
    const number = field("a", { fieldType: "number" });
    expect(commitFieldValue(number, "7.0", "7")).toEqual({ action: "none" });
    expect(commitFieldValue(number, "8", "7")).toEqual({
      action: "save",
      value: "8",
    });
  });

  it("saves a boolean either way, and clears it back to undecided", () => {
    const boolean = field("a", { fieldType: "boolean" });
    expect(commitFieldValue(boolean, "false", "")).toEqual({
      action: "save",
      value: "false",
    });
    expect(commitFieldValue(boolean, "", "false")).toEqual({
      action: "save",
      value: null,
    });
  });
});

describe("filledCount", () => {
  it("counts the members on screen, not the team", () => {
    const rows = [member({ a: "S" }), member({ a: "" }), member({})];
    expect(filledCount("a", rows)).toEqual({ done: 1, total: 3 });
  });
});
