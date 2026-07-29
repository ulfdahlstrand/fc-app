import { ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";

/**
 * The whole security surface of call-up responses (issue #17).
 *
 * A user may answer only for members they are **linked** to — themselves, or a
 * child they are guardian for (#9). Everything else in this feature is a list;
 * this is the part that must not be got wrong, so it lives on its own with
 * tests rather than inline in a handler.
 *
 * Holding `callups.respond` in the team is necessary but nowhere near
 * sufficient: every player in a squad holds it, and none of them may answer
 * for each other.
 */
export async function requireLinkedMember(
  db: Kysely<Database>,
  userId: string,
  memberId: string
): Promise<void> {
  const link = await db
    .selectFrom("member_guardians")
    .select("member_id")
    .where("user_id", "=", userId)
    .where("member_id", "=", memberId)
    .executeTakeFirst();

  if (!link) {
    // Deliberately not NOT_FOUND: the member exists, and saying so is fine —
    // what is refused is answering on their behalf.
    throw new ORPCError("FORBIDDEN", {
      message: "You can only answer for members you are linked to",
    });
  }
}
