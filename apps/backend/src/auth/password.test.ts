/** Password hashing: never the password, always its own salt, never throws on bad input. */
import { describe, expect, it } from "vitest";
import {
  burnVerification,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "./password.js";

describe("hashPassword", () => {
  it("never contains the password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).not.toContain("correct horse battery");
    expect(hash.startsWith("scrypt$32768$8$3$")).toBe(true);
  });

  it("salts every hash, so the same password hashes differently", async () => {
    const a = await hashPassword("same password here");
    const b = await hashPassword("same password here");
    expect(a).not.toEqual(b);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("treats Unicode forms of the same text as the same password", async () => {
    // "é" precomposed vs "e" + combining acute: one word, typed on two devices.
    const hash = await hashPassword("café-lösenord");
    expect(await verifyPassword("café-lösenord", hash)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["plaintext", "correct horse battery"],
    ["wrong scheme", "bcrypt$10$8$1$c2FsdA$a2V5"],
    ["missing parts", "scrypt$32768$8$3$c2FsdA"],
    ["non-numeric params", "scrypt$abc$8$3$c2FsdA$a2V5"],
    ["N not a power of two", "scrypt$30000$8$3$c2FsdA$a2V5"],
    ["N absurdly large", `scrypt$${2 ** 30}$8$3$c2FsdA$a2V5`],
  ])("returns false for a malformed stored value (%s)", async (_, stored) => {
    expect(await verifyPassword("anything at all", stored)).toBe(false);
  });
});

describe("needsRehash", () => {
  it("is false for a current hash", async () => {
    expect(needsRehash(await hashPassword("a fine password"))).toBe(false);
  });

  it("is true for weaker parameters", () => {
    expect(needsRehash("scrypt$16384$8$1$c2FsdA$a2V5")).toBe(true);
  });
});

describe("burnVerification", () => {
  it("resolves without revealing anything", async () => {
    await expect(burnVerification("whatever")).resolves.toBeUndefined();
  });
});
