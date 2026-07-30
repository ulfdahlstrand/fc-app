/** Resolving an OAuth identity to a user, creating one on first sign-in. */
import type { Kysely } from "kysely";
import type { Database } from "../db/types.js";
import type { OAuthProfile } from "./google.js";

/** Resolves an OAuth profile to a user id, creating rows as needed: 1. */
export async function signInWithProfile(
  db: Kysely<Database>,
  profile: OAuthProfile
): Promise<string> {
  const identity = await db
    .selectFrom("identities")
    .select("user_id")
    .where("provider", "=", profile.provider)
    .where("subject", "=", profile.subject)
    .executeTakeFirst();

  if (identity) {
    return identity.user_id;
  }

  const existingUser = await db
    .selectFrom("users")
    .select("id")
    .where("email", "=", profile.email)
    .executeTakeFirst();

  const userId = existingUser
    ? existingUser.id
    : (
        await db
          .insertInto("users")
          .values({
            email: profile.email,
            name: profile.name,
            image_url: profile.imageUrl,
          })
          .returning("id")
          .executeTakeFirstOrThrow()
      ).id;

  await db
    .insertInto("identities")
    .values({
      user_id: userId,
      provider: profile.provider,
      subject: profile.subject,
    })
    .execute();

  return userId;
}
