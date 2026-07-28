/**
 * Kysely database schema types.
 *
 * Each table gets an interface here and a corresponding entry in `Database`.
 * These are maintained by hand alongside each migration (ADR-006).
 */
import type { ColumnType, Generated } from "kysely";

/** timestamptz column with a database-side default — never written by the app. */
type Timestamp = ColumnType<Date, never, never>;

export interface UsersTable {
  id: Generated<string>;
  email: string;
  name: string;
  image_url: string | null;
  created_at: Timestamp;
  updated_at: ColumnType<Date, never, Date>;
}

export interface IdentitiesTable {
  id: Generated<string>;
  user_id: string;
  provider: string;
  subject: string;
  created_at: Timestamp;
}

export interface SessionsTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  expires_at: ColumnType<Date, Date, Date>;
  created_at: Timestamp;
}

export interface ClubsTable {
  id: Generated<string>;
  name: string;
  created_at: Timestamp;
  updated_at: ColumnType<Date, never, Date>;
}

export interface TeamsTable {
  id: Generated<string>;
  club_id: string;
  name: string;
  created_at: Timestamp;
}

export interface MembershipsTable {
  id: Generated<string>;
  user_id: string;
  club_id: string;
  /** null = club-wide membership; set = scoped to a single team. */
  team_id: string | null;
  role_id: string;
  created_at: Timestamp;
}

export interface RolesTable {
  id: Generated<string>;
  club_id: string;
  name: string;
  /** admin | coach | player | guardian for seeded roles; null for custom ones. */
  system_key: string | null;
  created_at: Timestamp;
}

export interface RolePermissionsTable {
  role_id: string;
  permission: string;
}

export interface InvitationsTable {
  id: Generated<string>;
  club_id: string;
  team_id: string | null;
  role_id: string;
  email: string | null;
  token: string;
  expires_at: ColumnType<Date, Date, Date>;
  created_by: string;
  used_at: ColumnType<Date, never, Date> | null;
  used_by: string | null;
  revoked_at: ColumnType<Date, never, Date> | null;
  created_at: Timestamp;
  /** Set for member-bound (guardian) invitations (#9). */
  member_id: string | null;
  relation: string | null;
}

export interface MembersTable {
  id: Generated<string>;
  team_id: string;
  first_name: string;
  last_name: string;
  birth_year: number | null;
  email: string | null;
  phone: string | null;
  archived: Generated<boolean>;
  created_at: Timestamp;
  updated_at: ColumnType<Date, never, Date>;
}

export interface MemberFieldDefinitionsTable {
  id: Generated<string>;
  team_id: string;
  name: string;
  field_type: string;
  options: ColumnType<string[], string, string>;
  required: Generated<boolean>;
  sort_order: Generated<number>;
  archived: Generated<boolean>;
  created_at: Timestamp;
}

export interface MemberFieldValuesTable {
  member_id: string;
  definition_id: string;
  value: string;
}

export interface MemberGuardiansTable {
  member_id: string;
  user_id: string;
  relation: string;
  created_at: Timestamp;
}

export interface GroupsTable {
  id: Generated<string>;
  team_id: string;
  name: string;
  created_at: Timestamp;
}

export interface GroupMembersTable {
  group_id: string;
  member_id: string;
}

export interface ActivityTypesTable {
  id: Generated<string>;
  team_id: string;
  name: string;
  /** A Kit palette token name, not a hex value — see the migration. */
  colour: Generated<string>;
  supports_call_ups: Generated<boolean>;
  sort_order: Generated<number>;
  archived: Generated<boolean>;
  created_at: Timestamp;
}

export interface Database {
  users: UsersTable;
  identities: IdentitiesTable;
  sessions: SessionsTable;
  clubs: ClubsTable;
  teams: TeamsTable;
  memberships: MembershipsTable;
  roles: RolesTable;
  role_permissions: RolePermissionsTable;
  invitations: InvitationsTable;
  members: MembersTable;
  member_field_definitions: MemberFieldDefinitionsTable;
  member_field_values: MemberFieldValuesTable;
  member_guardians: MemberGuardiansTable;
  groups: GroupsTable;
  group_members: GroupMembersTable;
  activity_types: ActivityTypesTable;
}
