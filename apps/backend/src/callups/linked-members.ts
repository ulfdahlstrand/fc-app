/** The security surface of call-up responses (ADR-016). */
import { ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";

export async function isLinkedMember(
  db: Kysely<Database>,
  userId: string,
  memberId: string
): Promise<boolean> {
  const link = await db
    .selectFrom("member_guardians")
    .select("member_id")
    .where("user_id", "=", userId)
    .where("member_id", "=", memberId)
    .executeTakeFirst();
  return link !== undefined;
}

export async function requireLinkedMember(
  db: Kysely<Database>,
  userId: string,
  memberId: string
): Promise<void> {
  if (!(await isLinkedMember(db, userId, memberId))) {
    // Deliberately not NOT_FOUND: the member exists, and saying so is fine —
    // what is refused is answering on their behalf.
    throw new ORPCError("FORBIDDEN", {
      message: "You can only answer for members you are linked to",
    });
  }
}

/**
 * Who may answer, and whether it counts as answering *on someone's behalf*.
 *
 * Two routes in:
 *  - **Linked** (self or guardian, #9) — answering your own question.
 *  - **`callups.manage`** — a coach recording "he phoned to say he can't make
 *    it", which is how a good half of these arrive.
 *
 * A coach who is also the member's guardian takes the first route: answering
 * for your own child is not on anyone's behalf, and the UI should not brand it
 * as though it were. That is why `onBehalf` is decided here, once, and stored
 * with the answer rather than re-derived later from links that may have moved.
 */
export function decideResponder(access: {
  isLinked: boolean;
  canManage: boolean;
  canRespond: boolean;
}): { allowed: boolean; onBehalf: boolean } {
  if (access.isLinked && access.canRespond) {
    return { allowed: true, onBehalf: false };
  }
  if (access.canManage) {
    return { allowed: true, onBehalf: true };
  }
  return { allowed: false, onBehalf: false };
}
