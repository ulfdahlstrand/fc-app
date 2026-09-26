import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH } from "@fc-app/contracts";
import { suggestPassword, type RandomBytes } from "./password-suggest";

/** Bytes in a fixed order, so a suggestion can be asserted exactly. */
function bytes(values: number[]): RandomBytes {
  let at = 0;
  return (count) => {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i += 1) {
      out[i] = values[at % values.length] ?? 0;
      at += 1;
    }
    return out;
  };
}

describe("suggestPassword", () => {
  it("groups its characters and clears the contract's floor", () => {
    const password = suggestPassword();
    expect(password).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(password.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
  });

  it("never offers a character that is read as another one", () => {
    for (let round = 0; round < 200; round += 1) {
      expect(suggestPassword()).not.toMatch(/[ilo01]/);
    }
  });

  it("maps each accepted byte onto the alphabet", () => {
    // 0 is the first letter, 30 the last: "a" and "9".
    expect(suggestPassword(bytes([0]))).toBe("aaaa-aaaa-aaaa");
    expect(suggestPassword(bytes([30]))).toBe("9999-9999-9999");
  });

  it("throws away bytes that would bias the first letters", () => {
    // 248 is the first byte past the last whole block of 31, so it is dropped
    // and the next one decides the character. Folding it back would yield "a".
    expect(suggestPassword(bytes([248, 1]))).toBe("bbbb-bbbb-bbbb");
  });

  it("does not repeat itself", () => {
    const seen = new Set<string>();
    for (let round = 0; round < 100; round += 1) seen.add(suggestPassword());
    expect(seen.size).toBe(100);
  });
});
