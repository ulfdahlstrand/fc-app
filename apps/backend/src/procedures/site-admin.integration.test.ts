/**
 * Site administration against a real database: creating accounts (ADR-025),
 * listing them and replacing a password (ADR-026).
 *
 * The feature's promise is mostly about what it refuses: nobody but a site
 * admin reaches it, an address that already has an account is never given a
 * password its owner did not choose, and a role or team from another club
 * cannot be paired with this one. The rest is that the account it does create
 * can sign in with the password straight away and lands in the club.
 */
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { call, ORPCError } from "@orpc/server";
import type { Kysely } from "kysely";
import type { AppContext } from "../context.js";
import type { Database } from "../db/types.js";
import { login } from "../auth/password-flows.js";
import { closeTestDb, testDb, truncateAll } from "../test/database.js";
import {
  createTestClub,
  createTestUser,
  type TestClub,
  type TestUser,
} from "../test/fixtures.js";
import {
  siteAdminClubHandler,
  siteAdminCreateUserHandler,
  siteAdminSetPasswordHandler,
  siteAdminUsersHandler,
} from "./site-admin.js";

const PASSWORD = "ett långt lösenord";

let db: Kysely<Database>;
let club: TestClub;
let clubAdmin: TestUser;
let siteAdmin: AppContext;

function input(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ny Tränare",
    email: "ny.tranare@example.test",
    password: PASSWORD,
    clubId: club.clubId,
    roleId: club.roleIds["coach"] ?? "",
    teamId: club.teamId,
    ...overrides,
  };
}

async function expectRefused(promise: Promise<unknown>, code: string) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ORPCError);
  expect((error as ORPCError<string, unknown>).code).toBe(code);
}

beforeEach(async () => {
  db = await testDb();
  await truncateAll();
  club = await createTestClub(db);
  clubAdmin = await createTestUser(db, club, { systemKey: "admin" });
  // Set by SQL in real life; nothing in the app grants it.
  await db
    .updateTable("users")
    .set({ is_site_admin: true })
    .where("id", "=", clubAdmin.userId)
    .execute();
  siteAdmin = {
    user: { ...clubAdmin.context.user!, isSiteAdmin: true },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closeTestDb();
});

describe("siteAdminCreateUser", () => {
  it("creates an account that signs in with the password, in the club", async () => {
    const { userId } = await call(siteAdminCreateUserHandler, input(), {
      context: siteAdmin,
    });

    expect(await login(db, "ny.tranare@example.test", PASSWORD)).toBe(userId);

    const memberships = await db
      .selectFrom("memberships")
      .select(["club_id", "team_id", "role_id"])
      .where("user_id", "=", userId)
      .execute();
    expect(memberships).toEqual([
      {
        club_id: club.clubId,
        team_id: club.teamId,
        role_id: club.roleIds["coach"],
      },
    ]);
  });

  it("stores the address as the contract normalises it", async () => {
    const { userId } = await call(
      siteAdminCreateUserHandler,
      input({ email: "  Ny.Tranare@Example.TEST " }),
      { context: siteAdmin }
    );
    const user = await db
      .selectFrom("users")
      .select("email")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow();
    expect(user.email).toBe("ny.tranare@example.test");
  });

  it("can place the account in the whole club rather than a team", async () => {
    const { userId } = await call(
      siteAdminCreateUserHandler,
      input({ teamId: null, roleId: club.roleIds["admin"] }),
      { context: siteAdmin }
    );
    const membership = await db
      .selectFrom("memberships")
      .select("team_id")
      .where("user_id", "=", userId)
      .executeTakeFirstOrThrow();
    expect(membership.team_id).toBeNull();
  });

  it("is refused to a club admin who is not a site admin", async () => {
    await expectRefused(
      call(siteAdminCreateUserHandler, input(), {
        context: clubAdmin.context,
      }),
      "FORBIDDEN"
    );
  });

  it("is refused when signed out", async () => {
    await expectRefused(
      call(siteAdminCreateUserHandler, input(), { context: { user: null } }),
      "UNAUTHORIZED"
    );
  });

  it("never gives an existing account a password, whatever case it is typed in", async () => {
    const existing = await createTestUser(db, club, {
      systemKey: "player",
      email: "finns@example.test",
    });

    await expectRefused(
      call(siteAdminCreateUserHandler, input({ email: "FINNS@example.test" }), {
        context: siteAdmin,
      }),
      "CONFLICT"
    );

    const credentials = await db
      .selectFrom("password_credentials")
      .select("user_id")
      .where("user_id", "=", existing.userId)
      .execute();
    expect(credentials).toEqual([]);
  });

  it("refuses a role or a team belonging to another club", async () => {
    const other = await createTestClub(db, "Andra klubben");

    await expectRefused(
      call(
        siteAdminCreateUserHandler,
        input({ roleId: other.roleIds["admin"] }),
        { context: siteAdmin }
      ),
      "NOT_FOUND"
    );
    await expectRefused(
      call(siteAdminCreateUserHandler, input({ teamId: other.teamId }), {
        context: siteAdmin,
      }),
      "NOT_FOUND"
    );

    const users = await db
      .selectFrom("users")
      .select("id")
      .where("email", "=", "ny.tranare@example.test")
      .execute();
    expect(users).toEqual([]);
  });

  it("spends a pending signup for the address, so its link cannot add a second password", async () => {
    await db
      .insertInto("email_tokens")
      .values({
        token_hash: "pending",
        purpose: "signup",
        email: "ny.tranare@example.test",
        user_id: null,
        name: "Någon",
        password_hash: "scrypt$stale",
        expires_at: new Date(Date.now() + 60_000),
      })
      .execute();

    await call(siteAdminCreateUserHandler, input(), { context: siteAdmin });

    const token = await db
      .selectFrom("email_tokens")
      .select("used_at")
      .where("token_hash", "=", "pending")
      .executeTakeFirstOrThrow();
    expect(token.used_at).not.toBeNull();
  });
});

describe("siteAdminClub", () => {
  it("lists the club's roles and teams for the form", async () => {
    const result = await call(
      siteAdminClubHandler,
      { clubId: club.clubId },
      { context: siteAdmin }
    );
    expect(result.teams).toEqual([{ id: club.teamId, name: "P14" }]);
    expect(result.roles.map((role) => role.systemKey).sort()).toEqual([
      "admin",
      "coach",
      "guardian",
      "player",
    ]);
  });

  it("is refused to a club admin who is not a site admin", async () => {
    await expectRefused(
      call(
        siteAdminClubHandler,
        { clubId: club.clubId },
        { context: clubAdmin.context }
      ),
      "FORBIDDEN"
    );
  });
});

describe("siteAdminUsers", () => {
  it("lists every account with how it signs in and where it belongs", async () => {
    await call(siteAdminCreateUserHandler, input({ name: "Ada Bengtsson" }), {
      context: siteAdmin,
    });
    const google = await createTestUser(db, club, {
      name: "Google Gunnar",
      email: "gunnar@example.test",
      systemKey: "coach",
      teamId: club.teamId,
    });
    await db
      .insertInto("identities")
      .values({
        user_id: google.userId,
        provider: "google",
        subject: "g-gunnar",
      })
      .execute();

    const { users, truncated } = await call(
      siteAdminUsersHandler,
      { search: "" },
      { context: siteAdmin }
    );

    expect(truncated).toBe(false);
    // The club admin from the fixture is in here too — everyone is.
    expect(users).toHaveLength(3);

    const ada = users.find((user) => user.name === "Ada Bengtsson");
    expect(ada).toMatchObject({
      email: "ny.tranare@example.test",
      hasPassword: true,
      hasGoogle: false,
      isSiteAdmin: false,
      memberships: [
        { clubName: "Testklubben", teamName: "P14", roleName: "Coach" },
      ],
    });
    expect(typeof ada?.createdAt).toBe("string");

    const gunnar = users.find((user) => user.id === google.userId);
    expect(gunnar).toMatchObject({ hasPassword: false, hasGoogle: true });

    const admin = users.find((user) => user.id === clubAdmin.userId);
    // The fixture's membership is club-wide, which the list shows as no team.
    expect(admin).toMatchObject({
      isSiteAdmin: true,
      memberships: [{ clubName: "Testklubben", teamName: null }],
    });
  });

  it("reports whether activation is switched on", async () => {
    vi.stubEnv("ENABLE_ACCOUNT_ACTIVATION", "true");
    const on = await call(
      siteAdminUsersHandler,
      { search: "" },
      { context: siteAdmin }
    );
    expect(on.activationEnabled).toBe(true);

    vi.stubEnv("ENABLE_ACCOUNT_ACTIVATION", "");
    const off = await call(
      siteAdminUsersHandler,
      { search: "" },
      { context: siteAdmin }
    );
    expect(off.activationEnabled).toBe(false);
  });

  it("matches the search against name and address, either case", async () => {
    await createTestUser(db, club, {
      name: "Ada Bengtsson",
      email: "ada@example.test",
    });
    await createTestUser(db, club, {
      name: "Bo Karlsson",
      email: "bo@sundbyberg.test",
    });

    const byName = await call(
      siteAdminUsersHandler,
      { search: "aDa" },
      { context: siteAdmin }
    );
    expect(byName.users.map((user) => user.email)).toEqual([
      "ada@example.test",
    ]);

    const byEmail = await call(
      siteAdminUsersHandler,
      { search: "SUNDBYBERG" },
      { context: siteAdmin }
    );
    expect(byEmail.users.map((user) => user.name)).toEqual(["Bo Karlsson"]);
  });

  it("treats a wildcard in the search as a character, not a pattern", async () => {
    await createTestUser(db, club, { name: "Ada", email: "ada@example.test" });

    const result = await call(
      siteAdminUsersHandler,
      { search: "%" },
      { context: siteAdmin }
    );
    expect(result.users).toEqual([]);
  });

  it("is refused to a club admin, and to nobody signed in", async () => {
    await expectRefused(
      call(
        siteAdminUsersHandler,
        { search: "" },
        { context: clubAdmin.context }
      ),
      "FORBIDDEN"
    );
    await expectRefused(
      call(siteAdminUsersHandler, { search: "" }, { context: { user: null } }),
      "UNAUTHORIZED"
    );
  });
});

describe("siteAdminSetPassword", () => {
  const NEW_PASSWORD = "k7fp-2mqx-9vth";

  async function accountWithPassword(): Promise<string> {
    const { userId } = await call(siteAdminCreateUserHandler, input(), {
      context: siteAdmin,
    });
    return userId;
  }

  it("replaces the password and ends every session the account had", async () => {
    const userId = await accountWithPassword();
    await db
      .insertInto("sessions")
      .values([
        {
          user_id: userId,
          token_hash: "hash-a",
          expires_at: new Date(Date.now() + 86_400_000),
        },
        {
          user_id: userId,
          token_hash: "hash-b",
          expires_at: new Date(Date.now() + 86_400_000),
        },
      ])
      .execute();

    const result = await call(
      siteAdminSetPasswordHandler,
      { userId, password: NEW_PASSWORD },
      { context: siteAdmin }
    );

    expect(result.sessionsEnded).toBe(2);
    expect(await login(db, "ny.tranare@example.test", NEW_PASSWORD)).toBe(
      userId
    );
    // The old one is gone, not merely superseded.
    expect(await login(db, "ny.tranare@example.test", PASSWORD)).toBeNull();
    const sessions = await db
      .selectFrom("sessions")
      .select("id")
      .where("user_id", "=", userId)
      .execute();
    expect(sessions).toEqual([]);
  });

  it("leaves other accounts' sessions alone", async () => {
    const userId = await accountWithPassword();
    await db
      .insertInto("sessions")
      .values({
        user_id: clubAdmin.userId,
        token_hash: "hash-other",
        expires_at: new Date(Date.now() + 86_400_000),
      })
      .execute();

    const result = await call(
      siteAdminSetPasswordHandler,
      { userId, password: NEW_PASSWORD },
      { context: siteAdmin }
    );

    expect(result.sessionsEnded).toBe(0);
    const others = await db
      .selectFrom("sessions")
      .select("id")
      .where("user_id", "=", clubAdmin.userId)
      .execute();
    expect(others).toHaveLength(1);
  });

  it("refuses an account that has no password — Google's is not ours to replace", async () => {
    const google = await createTestUser(db, club, {
      email: "gunnar@example.test",
    });
    await db
      .insertInto("identities")
      .values({
        user_id: google.userId,
        provider: "google",
        subject: "g-gunnar",
      })
      .execute();

    await expectRefused(
      call(
        siteAdminSetPasswordHandler,
        { userId: google.userId, password: NEW_PASSWORD },
        { context: siteAdmin }
      ),
      "CONFLICT"
    );

    const credentials = await db
      .selectFrom("password_credentials")
      .select("user_id")
      .where("user_id", "=", google.userId)
      .execute();
    expect(credentials).toEqual([]);
  });

  it("refuses a never-used account while activation is switched off", async () => {
    vi.stubEnv("ENABLE_ACCOUNT_ACTIVATION", "false");
    const unused = await createTestUser(db, club, {
      email: "aldrig.inloggad@example.test",
    });

    await expectRefused(
      call(
        siteAdminSetPasswordHandler,
        { userId: unused.userId, password: NEW_PASSWORD },
        { context: siteAdmin }
      ),
      "CONFLICT"
    );
    expect(
      await login(db, "aldrig.inloggad@example.test", NEW_PASSWORD)
    ).toBeNull();
  });

  it("activates an account that has never been used — neither password nor Google", async () => {
    vi.stubEnv("ENABLE_ACCOUNT_ACTIVATION", "true");
    const unused = await createTestUser(db, club, {
      email: "aldrig.inloggad@example.test",
    });

    const result = await call(
      siteAdminSetPasswordHandler,
      { userId: unused.userId, password: NEW_PASSWORD },
      { context: siteAdmin }
    );

    expect(result.sessionsEnded).toBe(0);
    expect(await login(db, "aldrig.inloggad@example.test", NEW_PASSWORD)).toBe(
      unused.userId
    );
  });

  it("refuses an account that does not exist", async () => {
    await expectRefused(
      call(
        siteAdminSetPasswordHandler,
        { userId: crypto.randomUUID(), password: NEW_PASSWORD },
        { context: siteAdmin }
      ),
      "NOT_FOUND"
    );
  });

  it("is refused to a club admin, who keeps their own password", async () => {
    const userId = await accountWithPassword();

    await expectRefused(
      call(
        siteAdminSetPasswordHandler,
        { userId, password: NEW_PASSWORD },
        { context: clubAdmin.context }
      ),
      "FORBIDDEN"
    );
    expect(await login(db, "ny.tranare@example.test", PASSWORD)).toBe(userId);
  });
});
