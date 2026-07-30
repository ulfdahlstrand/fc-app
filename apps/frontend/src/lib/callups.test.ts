/** Squad bookkeeping (issue #16). */
import { describe, expect, it } from "vitest";
import { countResponses, squadChanged } from "./callups";

describe("countResponses", () => {
  it("counts each answer, and the squad as a whole", () => {
    expect(
      countResponses([
        { response: "accepted" },
        { response: "accepted" },
        { response: "declined" },
        { response: "pending" },
      ]),
    ).toEqual({ squad: 4, accepted: 2, declined: 1, pending: 1 });
  });

  it("counts an empty squad as empty rather than as anything else", () => {
    expect(countResponses([])).toEqual({
      squad: 0,
      accepted: 0,
      declined: 0,
      pending: 0,
    });
  });
});

describe("squadChanged", () => {
  it("is false when the same names are picked, whatever the order", () => {
    expect(squadChanged(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(false);
  });

  it("is true when someone is added", () => {
    expect(squadChanged(new Set(["a", "b"]), new Set(["a"]))).toBe(true);
  });

  it("is true when someone is removed", () => {
    expect(squadChanged(new Set(["a"]), new Set(["a", "b"]))).toBe(true);
  });

  it("is true when one name is swapped for another", () => {
    // Same size, different people — the cheap length check must not pass this.
    expect(squadChanged(new Set(["a", "c"]), new Set(["a", "b"]))).toBe(true);
  });

  it("is false for two empty squads", () => {
    expect(squadChanged(new Set(), new Set())).toBe(false);
  });
});
