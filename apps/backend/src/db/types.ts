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
  /** Plain text placeholder until the configurable role system (#5). */
  role: string;
  created_at: Timestamp;
}

export interface Database {
  users: UsersTable;
  identities: IdentitiesTable;
  sessions: SessionsTable;
  clubs: ClubsTable;
  teams: TeamsTable;
  memberships: MembershipsTable;
}
