/**
 * The link check behind call-up responses (issue #17).
 *
 * "A user cannot respond for a member they are not linked to" is an explicit
 * acceptance criterion, and it is the one thing here that would be a real
 * problem if it broke: every player in a squad holds `callups.respond`.
 */
import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import { requireLinkedMember } from "./linked-members.js";

const GUARDIAN = "550e8400-e29b-41d4-a716-446655440001";
const OTHER_USER = "550e8400-e29b-41d4-a716-446655440002";
const CHILD_ONE = "550e8400-e29b-41d4-a716-446655440010";
const CHILD_TWO = "550e8400-e29b-41d4-a716-446655440011";
const SOMEONE_ELSE = "550e8400-e29b-41d4-a716-446655440099";

/**
 * Stands in for `member_guardians`, applying the same `where` pairs the query
 * does, so a missing filter in the real code shows up as a passing check here.
 */
function buildDbMock(links: { user_id: string; member_id: string }[]) {
  const filters: Record<string, string> = {};
  const chain = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn((column: string, _op: string, value: string) => {
      filters[column] = value;
      return chain;
    }),
    executeTakeFirst: vi.fn(async () =>
      links.find(
        (link) =>
          link.user_id === filters["user_id"] &&
          link.member_id === filters["member_id"]
      )
    ),
  };
  return {
    db: { selectFrom: vi.fn(() => chain) } as unknown as Kysely<Database>,
    chain,
  };
}

const links = [
  { user_id: GUARDIAN, member_id: CHILD_ONE },
  { user_id: GUARDIAN, member_id: CHILD_TWO },
];

describe("requireLinkedMember", () => {
  it("lets a guardian answer for a child they are linked to", async () => {
    const { db } = buildDbMock(links);

    await expect(
      requireLinkedMember(db, GUARDIAN, CHILD_ONE)
    ).resolves.toBeUndefined();
  });

  it("lets the same guardian answer for their other child too", async () => {
    // Two children, two separate answers — the first acceptance criterion.
    const { db } = buildDbMock(links);

    await expect(
      requireLinkedMember(db, GUARDIAN, CHILD_TWO)
    ).resolves.toBeUndefined();
  });

  it("refuses a member the user is not linked to", async () => {
    const { db } = buildDbMock(links);

    await expect(
      requireLinkedMember(db, GUARDIAN, SOMEONE_ELSE)
    ).rejects.toThrow(ORPCError);
  });

  it("refuses another user answering for someone else's child", async () => {
    const { db } = buildDbMock(links);

    await expect(
      requireLinkedMember(db, OTHER_USER, CHILD_ONE)
    ).rejects.toThrow(ORPCError);
  });

  it("refuses with FORBIDDEN, not NOT_FOUND", async () => {
    // The member exists; what is refused is answering on their behalf.
    const { db } = buildDbMock(links);

    await expect(
      requireLinkedMember(db, OTHER_USER, CHILD_ONE)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("filters on both the user and the member", async () => {
    const { db, chain } = buildDbMock(links);

    await requireLinkedMember(db, GUARDIAN, CHILD_ONE);

    expect(chain.where).toHaveBeenCalledWith("user_id", "=", GUARDIAN);
    expect(chain.where).toHaveBeenCalledWith("member_id", "=", CHILD_ONE);
  });
});
