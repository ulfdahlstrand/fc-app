/**
 * Site administration (ADR-025): creating an account outright.
 *
 * Gated on the `is_site_admin` flag, not on any club permission. A club admin
 * already decides who may act inside their club, but creating an account with
 * an unproven address reaches past the club: the app matches invitations,
 * coaches and contacts by address (ADR-024), so whoever holds the password of
 * `coach@other.se` would inherit what other clubs send that address. Only
 * someone who could write the rows with `psql` anyway may do that.
 */
import { ORPCError } from "@orpc/server";
import { createAccountWithPassword } from "../auth/password-flows.js";
import { hashPassword } from "../auth/password.js";
import type { AuthUser } from "../auth/session.js";
import type { AppContext } from "../context.js";
import { getDb } from "../db/client.js";
import { os, requireUser } from "../orpc.js";

/** Returns the signed-in site admin, or throws FORBIDDEN. */
function requireSiteAdmin(context: AppContext): AuthUser {
  const user = requireUser(context);
  if (!user.isSiteAdmin) {
    throw new ORPCError("FORBIDDEN", { message: "Site admins only" });
  }
  return user;
}

async function requireClub(clubId: string): Promise<void> {
  const club = await getDb()
    .selectFrom("clubs")
    .select("id")
    .where("id", "=", clubId)
    .executeTakeFirst();
  if (!club) throw new ORPCError("NOT_FOUND", { message: "No such club" });
}

export const siteAdminClubHandler = os.siteAdminClub.handler(
  async ({ input, context }) => {
    requireSiteAdmin(context);
    await requireClub(input.clubId);
    const db = getDb();

    const [roles, teams] = await Promise.all([
      db
        .selectFrom("roles")
        .select(["id", "name", "system_key"])
        .where("club_id", "=", input.clubId)
        .orderBy("name")
        .execute(),
      db
        .selectFrom("teams")
        .select(["id", "name"])
        .where("club_id", "=", input.clubId)
        .orderBy("name")
        .execute(),
    ]);

    return {
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        systemKey: role.system_key,
      })),
      teams,
    };
  }
);

export const siteAdminCreateUserHandler = os.siteAdminCreateUser.handler(
  async ({ input, context }) => {
    requireSiteAdmin(context);
    await requireClub(input.clubId);
    const db = getDb();

    // Both must belong to the club named, or a membership could pair one
    // club's row with another club's role.
    const role = await db
      .selectFrom("roles")
      .select("id")
      .where("id", "=", input.roleId)
      .where("club_id", "=", input.clubId)
      .executeTakeFirst();
    if (!role) throw new ORPCError("NOT_FOUND", { message: "No such role" });

    if (input.teamId !== null) {
      const team = await db
        .selectFrom("teams")
        .select("id")
        .where("id", "=", input.teamId)
        .where("club_id", "=", input.clubId)
        .executeTakeFirst();
      if (!team) throw new ORPCError("NOT_FOUND", { message: "No such team" });
    }

    // Hashed before the transaction: scrypt takes a while, and the email lock
    // should not be held for it.
    const passwordHash = await hashPassword(input.password);

    const userId = await db.transaction().execute(async (tx) => {
      const id = await createAccountWithPassword(tx, {
        name: input.name,
        email: input.email,
        passwordHash,
      });
      if (!id) return null;

      await tx
        .insertInto("memberships")
        .values({
          user_id: id,
          club_id: input.clubId,
          team_id: input.teamId,
          role_id: input.roleId,
        })
        .execute();
      return id;
    });

    if (!userId) {
      throw new ORPCError("CONFLICT", {
        message: "An account with this address already exists",
      });
    }
    return { userId };
  }
);
