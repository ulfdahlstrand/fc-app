import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import type { OAuthProfile } from "./google.js";
import { signInWithProfile } from "./sign-in.js";

const PROFILE: OAuthProfile = {
  provider: "google",
  subject: "google-subject-1",
  email: "alice@example.com",
  name: "Alice",
  imageUrl: null,
};

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";

/**
 * Mock Kysely instance covering the three query shapes used by
 * signInWithProfile. Behaviour is controlled per test via the arguments.
 */
function buildDbMock(options: {
  identityRow?: { user_id: string } | undefined;
  userRow?: { id: string } | undefined;
}) {
  const identityChain = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue(options.identityRow),
  };
  const userChain = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue(options.userRow),
  };
  const selectFrom = vi.fn((table: string) =>
    table === "identities" ? identityChain : userChain
  );

  const insertedValues: Record<string, unknown[]> = {};
  const insertInto = vi.fn((table: string) => ({
    values: vi.fn((values: unknown) => {
      insertedValues[table] = [...(insertedValues[table] ?? []), values];
      return {
        execute: vi.fn().mockResolvedValue([]),
        returning: vi.fn().mockReturnValue({
          executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: USER_ID }),
        }),
      };
    }),
  }));

  const db = { selectFrom, insertInto } as unknown as Kysely<Database>;
  return { db, insertedValues };
}

describe("signInWithProfile", () => {
  it("returns the existing user for a known identity", async () => {
    const { db, insertedValues } = buildDbMock({
      identityRow: { user_id: USER_ID },
      userRow: undefined,
    });
    const result = await signInWithProfile(db, PROFILE);
    expect(result).toEqual(USER_ID);
    expect(insertedValues).toEqual({});
  });

  it("links a new identity to an existing user with the same email", async () => {
    const { db, insertedValues } = buildDbMock({
      identityRow: undefined,
      userRow: { id: USER_ID },
    });
    const result = await signInWithProfile(db, PROFILE);
    expect(result).toEqual(USER_ID);
    expect(insertedValues["users"]).toBeUndefined();
    expect(insertedValues["identities"]).toEqual([
      { user_id: USER_ID, provider: "google", subject: "google-subject-1" },
    ]);
  });

  it("creates a new user and identity when nothing matches", async () => {
    const { db, insertedValues } = buildDbMock({
      identityRow: undefined,
      userRow: undefined,
    });
    const result = await signInWithProfile(db, PROFILE);
    expect(result).toEqual(USER_ID);
    expect(insertedValues["users"]).toEqual([
      { email: PROFILE.email, name: PROFILE.name, image_url: null },
    ]);
    expect(insertedValues["identities"]).toEqual([
      { user_id: USER_ID, provider: "google", subject: "google-subject-1" },
    ]);
  });
});
