/** Kysely database schema types. */
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
  /** DATE column: derived from the personnummer when there is one (ADR-022). */
  birth_date: ColumnType<string | null, string | null, string | null>;
  /** The club person this member is, when a personnummer is known (ADR-023). */
  person_id: string | null;
  /** The exporting system's own key ("Medlems Nr"), when the file carried one. */
  external_ref: string | null;
  email: string | null;
  phone: string | null;
  archived: Generated<boolean>;
  created_at: Timestamp;
  updated_at: ColumnType<Date, never, Date>;
}

/**
 * The club's person register (ADR-023). A person is the record; a member is
 * that person in one team, so the same child in P14 and P17 is one row here.
 *
 * Holds identity and nothing else — ADR-022 keeps the number apart from names
 * and contact details, and only `members/personal-id.ts` reads this column.
 */
export interface PersonsTable {
  id: Generated<string>;
  club_id: string;
  /** Twelve digits, no separator. Unique within the club. */
  personal_id: string;
  created_at: Timestamp;
}

/**
 * People attached to a member who may not have an account: the export's
 * `Målsman` columns. `user_id` is set if and when they sign in (#64).
 */
export interface MemberContactsTable {
  id: Generated<string>;
  member_id: string;
  name: string;
  /** Free text as written ("Mamma", "Pappa") — not the guardian|self enum. */
  relation: string | null;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  /** Set when this contact is also on the roster — a coach who is a parent. */
  linked_member_id: string | null;
  sort_order: Generated<number>;
  created_at: Timestamp;
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

export interface CallupsTable {
  id: Generated<string>;
  activity_id: string;
  note: string | null;
  /** Draft until a coach publishes: picking a squad is not telling it. */
  published: Generated<boolean>;
  created_at: Timestamp;
  updated_at: ColumnType<Date, never, Date>;
}

export interface CallupInvitationsTable {
  callup_id: string;
  member_id: string;
  /** pending | accepted | declined — see `callupResponseSchema`. */
  response: Generated<string>;
  responded_at: ColumnType<Date | null, Date | null, Date | null>;
  response_note: string | null;
  /** Who answered; null while pending, or if the account is since gone. */
  responded_by_user_id: string | null;
  /** True when a coach answered for someone they are not linked to. */
  responded_on_behalf: Generated<boolean>;
  created_at: Timestamp;
}

export interface AttendanceStatusesTable {
  id: Generated<string>;
  team_id: string;
  name: string;
  /** A Kit palette token name, not a hex value — see the migration. */
  colour: Generated<string>;
  /** What statistics (#15) sums; stored, never inferred from the name. */
  counts_as_present: Generated<boolean>;
  sort_order: Generated<number>;
  archived: Generated<boolean>;
  created_at: Timestamp;
}

export interface AttendanceRecordsTable {
  activity_id: string;
  member_id: string;
  status_id: string;
  note: string | null;
  created_at: Timestamp;
  updated_at: ColumnType<Date, never, Date>;
}

export interface SeasonsTable {
  id: Generated<string>;
  team_id: string;
  name: string;
  /** DATE columns: a season starts on a day, not at an instant. */
  starts_on: ColumnType<string, string, string>;
  ends_on: ColumnType<string, string, string>;
  created_at: Timestamp;
}

export interface ActivitySeriesTable {
  id: Generated<string>;
  team_id: string;
  activity_type_id: string;
  title: string | null;
  location: string | null;
  notes: string | null;
  /** ISO weekday numbers, 1 = Monday … 7 = Sunday. */
  weekdays: number[];
  /** Local wall time ("18:00"), resolved through `time_zone`. */
  start_time: string;
  end_time: string | null;
  starts_on: ColumnType<string, string, string>;
  until: ColumnType<string, string, string>;
  time_zone: string;
  created_at: Timestamp;
  updated_at: ColumnType<Date, never, Date>;
}

export interface ActivitiesTable {
  id: Generated<string>;
  team_id: string;
  activity_type_id: string;
  /** Set when the activity was generated from a series (#13); null for one-offs. */
  series_id: string | null;
  /** Optional headline ("vs. Skiljebo SK"); falls back to the type name. */
  title: string | null;
  starts_at: ColumnType<Date, Date, Date>;
  /** null = open-ended (a team party has no set finish). */
  ends_at: ColumnType<Date | null, Date | null, Date | null>;
  location: string | null;
  notes: string | null;
  /** Cancelled, never deleted — the row stays visible, struck through. */
  cancelled: Generated<boolean>;
  created_at: Timestamp;
  updated_at: ColumnType<Date, never, Date>;
}

export interface TrackingDefinitionsTable {
  id: Generated<string>;
  team_id: string;
  name: string;
  /** done | date | text — see `trackingValueTypeSchema`. */
  value_type: string;
  sort_order: Generated<number>;
  archived: Generated<boolean>;
  created_at: Timestamp;
}

export interface TrackingEntriesTable {
  definition_id: string;
  member_id: string;
  value: string;
  /** Null once the account that ticked it is gone; the entry itself stays. */
  updated_by: string | null;
  updated_at: ColumnType<Date, Date | undefined, Date>;
}

export interface PostsTable {
  id: Generated<string>;
  team_id: string;
  /** Null once the account that wrote it is gone; the post itself stays. */
  author_id: string | null;
  title: string;
  body: string;
  /** Null = draft. Set = published, at that instant. */
  published_at: ColumnType<Date | null, Date | null, Date | null>;
  pinned: Generated<boolean>;
  created_at: Timestamp;
  updated_at: ColumnType<Date, never, Date>;
}

export interface PostTargetsTable {
  post_id: string;
  group_id: string;
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
  persons: PersonsTable;
  member_contacts: MemberContactsTable;
  member_field_definitions: MemberFieldDefinitionsTable;
  member_field_values: MemberFieldValuesTable;
  member_guardians: MemberGuardiansTable;
  groups: GroupsTable;
  group_members: GroupMembersTable;
  activity_types: ActivityTypesTable;
  activities: ActivitiesTable;
  activity_series: ActivitySeriesTable;
  seasons: SeasonsTable;
  attendance_statuses: AttendanceStatusesTable;
  attendance_records: AttendanceRecordsTable;
  callups: CallupsTable;
  callup_invitations: CallupInvitationsTable;
  tracking_definitions: TrackingDefinitionsTable;
  tracking_entries: TrackingEntriesTable;
  posts: PostsTable;
  post_targets: PostTargetsTable;
}
