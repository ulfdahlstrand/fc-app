/**
 * Site administration (ADR-025, ADR-026): creating an account outright, seeing
 * every account, and replacing the password of one that has one.
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

/**
 * How many accounts one request returns. An installation this size is browsed
 * by searching, not by scrolling a list of everyone; the cap keeps a page that
 * grows quietly from becoming a slow query nobody asked for.
 */
const USER_PAGE_SIZE = 100;

export const siteAdminUsersHandler = os.siteAdminUsers.handler(
  async ({ input, context }) => {
    requireSiteAdmin(context);
    const db = getDb();

    let query = db
      .selectFrom("users")
      .select(["id", "name", "email", "is_site_admin", "created_at"])
      .orderBy("name")
      .orderBy("email")
      // One past the cap, so the answer can say it was cut off without
      // counting every account in a second query.
      .limit(USER_PAGE_SIZE + 1);

    if (input.search) {
      const pattern = `%${input.search.replace(/[%_]/g, (c) => `\\${c}`)}%`;
      query = query.where((eb) =>
        eb.or([eb("name", "ilike", pattern), eb("email", "ilike", pattern)])
      );
    }

    const rows = await query.execute();
    const truncated = rows.length > USER_PAGE_SIZE;
    const page = rows.slice(0, USER_PAGE_SIZE);
    const ids = page.map((row) => row.id);

    if (ids.length === 0) return { users: [], truncated };

    // Three small queries over the page rather than joins on the list itself:
    // an account with several memberships would otherwise multiply its row.
    const [credentials, identities, memberships] = await Promise.all([
      db
        .selectFrom("password_credentials")
        .select("user_id")
        .where("user_id", "in", ids)
        .execute(),
      db
        .selectFrom("identities")
        .select("user_id")
        .where("user_id", "in", ids)
        .where("provider", "=", "google")
        .execute(),
      db
        .selectFrom("memberships")
        .innerJoin("clubs", "clubs.id", "memberships.club_id")
        .innerJoin("roles", "roles.id", "memberships.role_id")
        .leftJoin("teams", "teams.id", "memberships.team_id")
        .select([
          "memberships.user_id as user_id",
          "clubs.name as club_name",
          "teams.name as team_name",
          "roles.name as role_name",
        ])
        .where("memberships.user_id", "in", ids)
        .orderBy("clubs.name")
        .orderBy("teams.name")
        .execute(),
    ]);

    const withPassword = new Set(credentials.map((row) => row.user_id));
    const withGoogle = new Set(identities.map((row) => row.user_id));
    const byUser = new Map<string, typeof memberships>();
    for (const row of memberships) {
      const list = byUser.get(row.user_id);
      if (list) list.push(row);
      else byUser.set(row.user_id, [row]);
    }

    return {
      users: page.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        hasPassword: withPassword.has(row.id),
        hasGoogle: withGoogle.has(row.id),
        isSiteAdmin: row.is_site_admin,
        createdAt: row.created_at.toISOString(),
        memberships: (byUser.get(row.id) ?? []).map((m) => ({
          clubName: m.club_name,
          teamName: m.team_name,
          roleName: m.role_name,
        })),
      })),
      truncated,
    };
  }
);

export const siteAdminSetPasswordHandler = os.siteAdminSetPassword.handler(
  async ({ input, context }) => {
    requireSiteAdmin(context);
    const db = getDb();

    const target = await db
      .selectFrom("users")
      .leftJoin(
        "password_credentials",
        "password_credentials.user_id",
        "users.id"
      )
      .select(["users.id as id", "password_credentials.user_id as credential"])
      .where("users.id", "=", input.userId)
      .executeTakeFirst();
    if (!target) throw new ORPCError("NOT_FOUND", { message: "No such user" });

    // The deliberate limit of ADR-026: this replaces a password, it never adds
    // one. An account that only ever signed in with Google proved its address
    // to Google, and a site admin who could give it a password would be taking
    // the account over rather than helping its owner back in (ADR-024).
    if (!target.credential) {
      throw new ORPCError("CONFLICT", {
        message: "This account has no password to replace",
      });
    }

    // Outside the transaction: scrypt is slow on purpose, and no row needs to
    // be locked while it runs.
    const passwordHash = await hashPassword(input.password);

    const sessionsEnded = await db.transaction().execute(async (tx) => {
      await tx
        .insertInto("password_credentials")
        .values({ user_id: target.id, password_hash: passwordHash })
        .onConflict((oc) =>
          oc.column("user_id").doUpdateSet({
            password_hash: passwordHash,
            updated_at: new Date(),
          })
        )
        .execute();

      // Same rule as a reset link (auth/password-flows.ts): a changed password
      // signs the account out everywhere, so a session someone else holds dies
      // with the password it was opened with.
      const result = await tx
        .deleteFrom("sessions")
        .where("user_id", "=", target.id)
        .executeTakeFirst();
      return Number(result.numDeletedRows ?? 0n);
    });

    return { sessionsEnded };
  }
);
