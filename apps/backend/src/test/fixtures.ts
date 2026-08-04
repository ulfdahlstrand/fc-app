/**
 * The smallest real world a handler needs: a club with its seeded roles, a
 * team, and somebody signed in.
 *
 * Built with plain inserts plus the application's own `seedClubRoles`, so the
 * roles and permissions under test are the ones production creates rather than
 * a hand-written imitation that could drift.
 */
import type { Kysely } from "kysely";
import type { AppContext } from "../context.js";
import type { Database } from "../db/types.js";
import { seedClubRoles } from "../tenancy/seed.js";

export interface TestClub {
  clubId: string;
  teamId: string;
  adminRoleId: string;
  roleIds: Record<string, string>;
}

export async function createTestClub(
  db: Kysely<Database>,
  name = "Testklubben"
): Promise<TestClub> {
  const club = await db
    .insertInto("clubs")
    .values({ name })
    .returning("id")
    .executeTakeFirstOrThrow();

  const { adminRoleId } = await seedClubRoles(db, club.id);

  const team = await db
    .insertInto("teams")
    .values({ club_id: club.id, name: "P14" })
    .returning("id")
    .executeTakeFirstOrThrow();

  const roles = await db
    .selectFrom("roles")
    .select(["id", "system_key"])
    .where("club_id", "=", club.id)
    .execute();

  return {
    clubId: club.id,
    teamId: team.id,
    adminRoleId,
    roleIds: Object.fromEntries(
      roles.flatMap((role) => (role.system_key ? [[role.system_key, role.id]] : []))
    ),
  };
}

export async function createTestTeam(
  db: Kysely<Database>,
  clubId: string,
  name: string
): Promise<string> {
  const team = await db
    .insertInto("teams")
    .values({ club_id: clubId, name })
    .returning("id")
    .executeTakeFirstOrThrow();
  return team.id;
}

export interface TestUser {
  userId: string;
  email: string;
  context: AppContext;
}

/**
 * A user with a membership in the club. `systemKey` picks which seeded role
 * they hold, which is how a test asks "what does a coach see?".
 */
export async function createTestUser(
  db: Kysely<Database>,
  club: TestClub,
  options: { email?: string; name?: string; systemKey?: string } = {}
): Promise<TestUser> {
  const email = options.email ?? `user-${crypto.randomUUID()}@example.test`;
  const name = options.name ?? "Test User";

  const user = await db
    .insertInto("users")
    .values({ email, name, image_url: null })
    .returning("id")
    .executeTakeFirstOrThrow();

  const roleId = club.roleIds[options.systemKey ?? "admin"];
  if (roleId === undefined) {
    throw new Error(`No seeded role for ${options.systemKey ?? "admin"}`);
  }

  await db
    .insertInto("memberships")
    .values({
      user_id: user.id,
      club_id: club.clubId,
      team_id: null,
      role_id: roleId,
    })
    .execute();

  return {
    userId: user.id,
    email,
    context: { user: { id: user.id, email, name, imageUrl: null } },
  };
}

/** A member on a team's roster, with nothing but a name unless asked. */
export async function createTestMember(
  db: Kysely<Database>,
  teamId: string,
  values: {
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
    birthDate?: string | null;
  } = {}
): Promise<string> {
  const member = await db
    .insertInto("members")
    .values({
      team_id: teamId,
      first_name: values.firstName ?? "Test",
      last_name: values.lastName ?? "Testsson",
      email: values.email ?? null,
      phone: values.phone ?? null,
      birth_date: values.birthDate ?? null,
      birth_year: values.birthDate
        ? Number(values.birthDate.slice(0, 4))
        : null,
      external_ref: null,
      person_id: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return member.id;
}
