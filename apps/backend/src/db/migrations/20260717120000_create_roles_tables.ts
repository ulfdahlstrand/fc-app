import { sql, type Kysely } from "kysely";

/**
 * Configurable roles & permissions (issue #5, ADR-005):
 * - roles:            named permission sets per club; seeded system roles
 *                     carry a system_key (admin | coach | player | guardian)
 * - role_permissions: which catalog permissions each role grants
 * - memberships.role  (text placeholder) is replaced by role_id
 *
 * Existing clubs are backfilled with the four default roles and existing
 * memberships (all created with role='admin') are pointed at their club's
 * admin role. The default permission sets are duplicated here from
 * src/tenancy/roles.ts because migrations must stay self-contained.
 */

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    "members.view",
    "members.manage",
    "activities.manage",
    "attendance.record",
    "callups.manage",
    "callups.respond",
    "posts.manage",
    "tracking.manage",
    "settings.team",
    "settings.club",
  ],
  coach: [
    "members.view",
    "members.manage",
    "activities.manage",
    "attendance.record",
    "callups.manage",
    "posts.manage",
    "tracking.manage",
    "settings.team",
  ],
  player: ["callups.respond"],
  guardian: ["callups.respond"],
};

const DEFAULT_ROLE_NAMES: Record<string, string> = {
  admin: "Admin",
  coach: "Coach",
  player: "Player",
  guardian: "Guardian",
};

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("roles")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("club_id", "uuid", (col) =>
      col.notNull().references("clubs.id").onDelete("cascade")
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("system_key", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addUniqueConstraint("roles_club_name_uq", ["club_id", "name"])
    .addUniqueConstraint("roles_club_system_key_uq", ["club_id", "system_key"])
    .execute();

  await db.schema
    .createTable("role_permissions")
    .addColumn("role_id", "uuid", (col) =>
      col.notNull().references("roles.id").onDelete("cascade")
    )
    .addColumn("permission", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("role_permissions_pk", ["role_id", "permission"])
    .execute();

  // Backfill: default roles + permissions for every existing club.
  for (const [systemKey, name] of Object.entries(DEFAULT_ROLE_NAMES)) {
    await sql`
      INSERT INTO roles (club_id, name, system_key)
      SELECT id, ${name}, ${systemKey} FROM clubs
    `.execute(db);
    for (const permission of DEFAULT_ROLE_PERMISSIONS[systemKey] ?? []) {
      await sql`
        INSERT INTO role_permissions (role_id, permission)
        SELECT id, ${permission} FROM roles WHERE system_key = ${systemKey}
      `.execute(db);
    }
  }

  // memberships.role (text) → memberships.role_id (FK). Existing rows were
  // all created with the text 'admin', which matches a system_key.
  await db.schema
    .alterTable("memberships")
    .addColumn("role_id", "uuid", (col) => col.references("roles.id"))
    .execute();

  await sql`
    UPDATE memberships m
    SET role_id = r.id
    FROM roles r
    WHERE r.club_id = m.club_id AND r.system_key = m.role
  `.execute(db);

  await db.schema
    .alterTable("memberships")
    .alterColumn("role_id", (col) => col.setNotNull())
    .execute();

  await db.schema.alterTable("memberships").dropColumn("role").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("memberships")
    .addColumn("role", "text", (col) => col.notNull().defaultTo("admin"))
    .execute();
  await sql`
    UPDATE memberships m
    SET role = COALESCE(r.system_key, r.name)
    FROM roles r
    WHERE r.id = m.role_id
  `.execute(db);
  await db.schema.alterTable("memberships").dropColumn("role_id").execute();
  await db.schema.dropTable("role_permissions").execute();
  await db.schema.dropTable("roles").execute();
}
