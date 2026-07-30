/** Session token hashing and expiry. */
import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import {
  generateSessionToken,
  getUserBySessionToken,
  hashSessionToken,
} from "./session.js";

function buildSelectMock(row: unknown) {
  const executeTakeFirst = vi.fn().mockResolvedValue(row);
  const where = vi.fn().mockReturnValue({ executeTakeFirst });
  const select = vi.fn().mockReturnValue({ where });
  const innerJoin = vi.fn().mockReturnValue({ select });
  const selectFrom = vi.fn().mockReturnValue({ innerJoin });
  const db = { selectFrom } as unknown as Kysely<Database>;
  return { db, where };
}

const USER_ROW = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Alice",
  email: "alice@example.com",
  image_url: null,
  expires_at: new Date(Date.now() + 60_000),
};

describe("session tokens", () => {
  it("generates unique tokens", () => {
    expect(generateSessionToken()).not.toEqual(generateSessionToken());
  });

  it("hashes deterministically and never stores the raw token", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toEqual(hashSessionToken(token));
    expect(hash).not.toContain(token);
  });
});

describe("getUserBySessionToken", () => {
  it("returns the user for a valid session", async () => {
    const { db, where } = buildSelectMock(USER_ROW);
    const result = await getUserBySessionToken(db, "some-token");
    expect(result).toEqual({
      id: USER_ROW.id,
      name: USER_ROW.name,
      email: USER_ROW.email,
      imageUrl: null,
    });
    // The lookup must use the hash, not the raw token
    expect(where).toHaveBeenCalledWith(
      "sessions.token_hash",
      "=",
      hashSessionToken("some-token")
    );
  });

  it("returns null for an unknown token", async () => {
    const { db } = buildSelectMock(undefined);
    expect(await getUserBySessionToken(db, "unknown")).toBeNull();
  });

  it("returns null for an expired session", async () => {
    const { db } = buildSelectMock({
      ...USER_ROW,
      expires_at: new Date(Date.now() - 1),
    });
    expect(await getUserBySessionToken(db, "expired")).toBeNull();
  });
});
