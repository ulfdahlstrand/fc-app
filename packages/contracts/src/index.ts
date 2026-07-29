import { oc } from "@orpc/contract";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Query-string-safe boolean
//
// oRPC's OpenAPI layer does not coerce GET query parameters against the
// contract's Zod types — a query string can only carry text, so a plain
// value sent as `?includeArchived=true` arrives server-side as the string
// "true", not a boolean, and `z.boolean()` rejects it (BAD_REQUEST). This
// accepts a real boolean (handlers called directly, e.g. in tests) as well
// as the "true"/"false" strings the oRPC client actually puts on the wire
// for GET requests, and normalizes both to a boolean.
// ---------------------------------------------------------------------------

export const queryBooleanSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value === "true"
        ? true
        : value === "false"
          ? false
          : value
      : value,
  z.boolean()
);

// ---------------------------------------------------------------------------
// Health procedure — Zod schemas
// ---------------------------------------------------------------------------

export const healthInputSchema = z.object({
  echo: z.string().optional(),
});

export const healthOutputSchema = z.object({
  status: z.literal("ok"),
  echo: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Auth — Zod schemas
//
// `me` returns the signed-in user derived from the session cookie, or null.
// Sign-in itself is a browser redirect flow (GET /auth/google →
// /auth/google/callback) and logout is POST /auth/logout — plain HTTP
// endpoints on the backend, since they set/clear cookies and redirect.
// ---------------------------------------------------------------------------

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  imageUrl: z.string().nullable(),
});

export type User = z.infer<typeof userSchema>;

export const meInputSchema = z.object({});

export const meOutputSchema = z.object({
  user: userSchema.nullable(),
});

// ---------------------------------------------------------------------------
// Permission catalog (ADR-005)
//
// The catalog is fixed in code — adding a permission is a code change — while
// which permissions a role has is club-configurable data. Shared here so the
// frontend can gate UI on the same identifiers the backend enforces.
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
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
] as const;

export const permissionSchema = z.enum(PERMISSIONS);

export type Permission = z.infer<typeof permissionSchema>;

// ---------------------------------------------------------------------------
// Roles — Zod schemas (ADR-005)
//
// Roles are named permission sets per club. Seeded system roles carry a
// systemKey; the admin role is immutable (always all permissions) so a club
// cannot lock itself out.
// ---------------------------------------------------------------------------

export const roleSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  name: z.string(),
  /** Set for seeded roles (admin | coach | player | guardian); null for custom roles. */
  systemKey: z.string().nullable(),
  permissions: z.array(permissionSchema),
  /** Number of memberships currently using the role. */
  memberCount: z.number(),
});

export type Role = z.infer<typeof roleSchema>;

export const listRolesInputSchema = z.object({
  clubId: z.string(),
});

export const listRolesOutputSchema = z.object({
  roles: z.array(roleSchema),
});

export const createRoleInputSchema = z.object({
  clubId: z.string(),
  name: z.string().min(1).max(50),
  permissions: z.array(permissionSchema),
});

export const createRoleOutputSchema = z.object({
  role: roleSchema,
});

export const updateRoleInputSchema = z.object({
  clubId: z.string(),
  roleId: z.string(),
  name: z.string().min(1).max(50).optional(),
  permissions: z.array(permissionSchema).optional(),
});

export const updateRoleOutputSchema = z.object({
  role: roleSchema,
});

export const deleteRoleInputSchema = z.object({
  clubId: z.string(),
  roleId: z.string(),
});

export const deleteRoleOutputSchema = z.object({
  deleted: z.literal(true),
});

// ---------------------------------------------------------------------------
// Clubs & teams — Zod schemas (ADR-003 multi-tenancy)
//
// A club is the tenant root; teams belong to a club. `myClubs` returns only
// clubs the caller is a member of — the frontend's club/team switcher and
// onboarding redirect are driven by it.
// ---------------------------------------------------------------------------

export const teamSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  name: z.string(),
});

export type Team = z.infer<typeof teamSchema>;

export const clubSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type Club = z.infer<typeof clubSchema>;

/** A team with the caller's effective role and permissions in it. */
export const myTeamSchema = teamSchema.extend({
  role: z.string(),
  permissions: z.array(permissionSchema),
});

export type MyTeam = z.infer<typeof myTeamSchema>;

export const myClubSchema = clubSchema.extend({
  /** The caller's club-wide role name, or null when only team-scoped memberships exist. */
  role: z.string().nullable(),
  /** Permissions of the club-wide role; empty without a club-wide membership. */
  permissions: z.array(permissionSchema),
  /** Teams the caller's memberships grant access to, with the effective role per team. */
  teams: z.array(myTeamSchema),
});

export type MyClub = z.infer<typeof myClubSchema>;

export const myClubsInputSchema = z.object({});

export const myClubsOutputSchema = z.object({
  clubs: z.array(myClubSchema),
});

export const createClubInputSchema = z.object({
  clubName: z.string().min(1).max(100),
  teamName: z.string().min(1).max(100),
});

export const createClubOutputSchema = z.object({
  club: clubSchema,
  team: teamSchema,
});

/**
 * Guardian relation (#9). Declared here (ahead of the guardians section) so
 * member-bound invitations below can reference it.
 */
export const guardianRelationSchema = z.enum(["guardian", "self"]);

export type GuardianRelation = z.infer<typeof guardianRelationSchema>;

// ---------------------------------------------------------------------------
// Invitations — Zod schemas (ADR-004, issue #6)
//
// An invitation grants a preset role in a club — club-wide (teamId null) or
// scoped to one team — via a shareable link. Optionally restricted to a
// single email. Status is derived: active | expired | revoked | used.
// ---------------------------------------------------------------------------

export const invitationStatusSchema = z.enum([
  "active",
  "expired",
  "revoked",
  "used",
]);

export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

/** Admin-facing invitation (returned to club managers). */
export const invitationSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  teamId: z.string().nullable(),
  teamName: z.string().nullable(),
  roleId: z.string(),
  roleName: z.string(),
  email: z.string().nullable(),
  token: z.string(),
  status: invitationStatusSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
});

export type Invitation = z.infer<typeof invitationSchema>;

/** Public view of an invitation, resolved by token before sign-in. */
export const publicInvitationSchema = z.object({
  clubName: z.string(),
  teamName: z.string().nullable(),
  roleName: z.string(),
  /** When set, only this email may accept the invitation. */
  email: z.string().nullable(),
  status: invitationStatusSchema,
});

export const createInvitationInputSchema = z.object({
  clubId: z.string(),
  teamId: z.string().nullable().optional(),
  roleId: z.string(),
  email: z.string().email().nullable().optional(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
  /** When set, accepting also links the user to this member (#9). */
  memberId: z.string().nullable().optional(),
  /** Guardian relation for the member link; defaults to "guardian". */
  relation: guardianRelationSchema.optional(),
});

export const createInvitationOutputSchema = z.object({
  invitation: invitationSchema,
});

export const listInvitationsInputSchema = z.object({
  clubId: z.string(),
});

export const listInvitationsOutputSchema = z.object({
  invitations: z.array(invitationSchema),
});

export const revokeInvitationInputSchema = z.object({
  clubId: z.string(),
  invitationId: z.string(),
});

export const revokeInvitationOutputSchema = z.object({
  revoked: z.literal(true),
});

export const getInvitationInputSchema = z.object({
  token: z.string(),
});

export const getInvitationOutputSchema = z.object({
  invitation: publicInvitationSchema,
});

export const acceptInvitationInputSchema = z.object({
  token: z.string(),
});

export const acceptInvitationOutputSchema = z.object({
  clubId: z.string(),
  teamId: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Members — Zod schemas (issue #7)
//
// A member is a roster person (usually a player), scoped to one team, distinct
// from a user account. Core fields are kept minimal; team-specific fields come
// via custom field definitions (#8). Members are archived, never hard-deleted.
// ---------------------------------------------------------------------------

export const memberSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  birthYear: z.number().int().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  archived: z.boolean(),
  /** Custom field values keyed by field-definition id (#8), raw string form. */
  customFields: z.record(z.string(), z.string()),
});

export type Member = z.infer<typeof memberSchema>;

// ---------------------------------------------------------------------------
// Custom member fields (issue #8, ADR-005)
//
// Teams define their own typed member fields; values are stored per member.
// The catalog of field *types* is fixed in code; which fields exist is data.
// ---------------------------------------------------------------------------

export const memberFieldTypeSchema = z.enum([
  "text",
  "number",
  "date",
  "boolean",
  "select",
]);

export type MemberFieldType = z.infer<typeof memberFieldTypeSchema>;

export const memberFieldDefinitionSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  fieldType: memberFieldTypeSchema,
  /** Allowed values for a "select" field; empty for other types. */
  options: z.array(z.string()),
  required: z.boolean(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
});

export type MemberFieldDefinition = z.infer<
  typeof memberFieldDefinitionSchema
>;

/**
 * Validates and normalizes a raw value against a field definition. Returns the
 * canonical string to store, or an error message. Shared by the backend
 * (enforcement) and the frontend (inline feedback) so the rules never drift.
 */
export function validateMemberFieldValue(
  field: Pick<MemberFieldDefinition, "fieldType" | "options">,
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  switch (field.fieldType) {
    case "text":
      return { ok: true, value: raw };
    case "number": {
      if (trimmed === "" || !Number.isFinite(Number(trimmed))) {
        return { ok: false, error: "Not a valid number" };
      }
      return { ok: true, value: String(Number(trimmed)) };
    }
    case "date": {
      // Expect YYYY-MM-DD; reject anything Date can't parse to that shape.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return { ok: false, error: "Expected a date (YYYY-MM-DD)" };
      }
      const parsed = new Date(`${trimmed}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, error: "Not a valid date" };
      }
      return { ok: true, value: trimmed };
    }
    case "boolean": {
      if (trimmed !== "true" && trimmed !== "false") {
        return { ok: false, error: "Expected true or false" };
      }
      return { ok: true, value: trimmed };
    }
    case "select": {
      if (!field.options.includes(trimmed)) {
        return { ok: false, error: "Not an allowed option" };
      }
      return { ok: true, value: trimmed };
    }
  }
}

const MIN_BIRTH_YEAR = 1900;
const MAX_BIRTH_YEAR = 2100;

/**
 * Fields accepted when creating or updating a member. Exported so the frontend
 * can derive its form validation from the same rules the API enforces (ADR-007)
 * instead of restating them.
 */
export const memberWriteFields = {
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  birthYear: z.number().int().min(MIN_BIRTH_YEAR).max(MAX_BIRTH_YEAR).nullable(),
  email: z.string().email().max(255).nullable(),
  phone: z.string().max(50).nullable(),
};

export const listMembersInputSchema = z.object({
  teamId: z.string(),
  includeArchived: queryBooleanSchema.optional(),
  search: z.string().optional(),
  /** Filter to members belonging to this group (#10). */
  groupId: z.string().optional(),
});

export const listMembersOutputSchema = z.object({
  members: z.array(memberSchema),
});

export const getMemberInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
});

export const getMemberOutputSchema = z.object({
  member: memberSchema,
});

export const createMemberInputSchema = z.object({
  teamId: z.string(),
  firstName: memberWriteFields.firstName,
  lastName: memberWriteFields.lastName,
  birthYear: memberWriteFields.birthYear.optional(),
  email: memberWriteFields.email.optional(),
  phone: memberWriteFields.phone.optional(),
});

export const createMemberOutputSchema = z.object({
  member: memberSchema,
});

export const updateMemberInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
  firstName: memberWriteFields.firstName.optional(),
  lastName: memberWriteFields.lastName.optional(),
  birthYear: memberWriteFields.birthYear.optional(),
  email: memberWriteFields.email.optional(),
  phone: memberWriteFields.phone.optional(),
});

export const updateMemberOutputSchema = z.object({
  member: memberSchema,
});

export const setMemberArchivedInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
  archived: z.boolean(),
});

export const setMemberArchivedOutputSchema = z.object({
  member: memberSchema,
});

// Custom member field definitions & values (#8)

export const listMemberFieldsInputSchema = z.object({
  teamId: z.string(),
  includeArchived: queryBooleanSchema.optional(),
});

export const listMemberFieldsOutputSchema = z.object({
  fields: z.array(memberFieldDefinitionSchema),
});

export const createMemberFieldInputSchema = z.object({
  teamId: z.string(),
  name: z.string().min(1).max(100),
  fieldType: memberFieldTypeSchema,
  options: z.array(z.string().min(1).max(100)).max(50).optional(),
  required: z.boolean().optional(),
});

export const createMemberFieldOutputSchema = z.object({
  field: memberFieldDefinitionSchema,
});

export const updateMemberFieldInputSchema = z.object({
  teamId: z.string(),
  fieldId: z.string(),
  name: z.string().min(1).max(100).optional(),
  options: z.array(z.string().min(1).max(100)).max(50).optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateMemberFieldOutputSchema = z.object({
  field: memberFieldDefinitionSchema,
});

export const archiveMemberFieldInputSchema = z.object({
  teamId: z.string(),
  fieldId: z.string(),
  archived: z.boolean(),
});

export const archiveMemberFieldOutputSchema = z.object({
  field: memberFieldDefinitionSchema,
});

export const setMemberFieldValuesInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
  /** Field-definition id → raw string value. A null/absent value clears it. */
  values: z.record(z.string(), z.string().nullable()),
});

export const setMemberFieldValuesOutputSchema = z.object({
  member: memberSchema,
});

// ---------------------------------------------------------------------------
// Guardians — Zod schemas (issue #9)
//
// Links a user account to a member. `self` = the member is the user (a player
// with their own account); `guardian` = a parent/carer. A user can be linked
// to several members (siblings); a member can have several guardians.
//
// (guardianRelationSchema is declared earlier — before the invitations
// section — because member-bound invitations reference it.)
// ---------------------------------------------------------------------------

/** A user linked to a member, as shown on the member detail page. */
export const memberGuardianSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  relation: guardianRelationSchema,
});

export type MemberGuardian = z.infer<typeof memberGuardianSchema>;

/** A club user offered in the guardian picker. */
export const clubUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

export type ClubUser = z.infer<typeof clubUserSchema>;

/** A member the signed-in user is linked to, with team/club context. */
export const linkedMemberSchema = z.object({
  memberId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  teamId: z.string(),
  teamName: z.string(),
  clubName: z.string(),
  relation: guardianRelationSchema,
});

export type LinkedMember = z.infer<typeof linkedMemberSchema>;

export const listMemberGuardiansInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
});

export const listMemberGuardiansOutputSchema = z.object({
  guardians: z.array(memberGuardianSchema),
});

export const addGuardianInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
  userId: z.string(),
  relation: guardianRelationSchema,
});

export const addGuardianOutputSchema = z.object({
  guardians: z.array(memberGuardianSchema),
});

export const removeGuardianInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
  userId: z.string(),
});

export const removeGuardianOutputSchema = z.object({
  guardians: z.array(memberGuardianSchema),
});

export const listClubUsersInputSchema = z.object({
  teamId: z.string(),
});

export const listClubUsersOutputSchema = z.object({
  users: z.array(clubUserSchema),
});

export const myMembersInputSchema = z.object({});

export const myMembersOutputSchema = z.object({
  members: z.array(linkedMemberSchema),
});

// ---------------------------------------------------------------------------
// Groups — Zod schemas (issue #10)
//
// Custom member groups ("A squad", "born 2014") reusable anywhere a "who" is
// selected: roster filtering, call-up squad selection (#16), and post
// targeting (#18). A member can belong to several groups; deleting a group
// never touches its members.
// ---------------------------------------------------------------------------

export const groupSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  memberCount: z.number(),
});

export type Group = z.infer<typeof groupSchema>;

export const listGroupsInputSchema = z.object({
  teamId: z.string(),
});

export const listGroupsOutputSchema = z.object({
  groups: z.array(groupSchema),
});

export const createGroupInputSchema = z.object({
  teamId: z.string(),
  name: z.string().min(1).max(100),
});

export const createGroupOutputSchema = z.object({
  group: groupSchema,
});

export const renameGroupInputSchema = z.object({
  teamId: z.string(),
  groupId: z.string(),
  name: z.string().min(1).max(100),
});

export const renameGroupOutputSchema = z.object({
  group: groupSchema,
});

export const deleteGroupInputSchema = z.object({
  teamId: z.string(),
  groupId: z.string(),
});

export const deleteGroupOutputSchema = z.object({
  deleted: z.literal(true),
});

export const listGroupMembersInputSchema = z.object({
  teamId: z.string(),
  groupId: z.string(),
});

export const listGroupMembersOutputSchema = z.object({
  memberIds: z.array(z.string()),
});

/** Replaces a group's full member list (simplest UI: a multi-select). */
export const setGroupMembersInputSchema = z.object({
  teamId: z.string(),
  groupId: z.string(),
  memberIds: z.array(z.string()),
});

export const setGroupMembersOutputSchema = z.object({
  memberIds: z.array(z.string()),
});

/** Groups a member belongs to — shown on the member detail page. */
export const listMemberGroupsInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
});

export const listMemberGroupsOutputSchema = z.object({
  groups: z.array(groupSchema),
});

/**
 * Activity type colours are Kit palette token names, never hex.
 *
 * The Kit design system allows three colour families and nothing else, so a
 * free-form colour picker would let a team design its way out of the system.
 * Storing the token (rather than the resolved value) also means the palette
 * can be re-themed without touching stored data.
 */
export const activityColourSchema = z.enum([
  "green", // the brand — training, the everyday session
  "ink", // the near-black — matches and other headline fixtures
  "orange", // needs someone to act
  "amber", // partial, provisional
  "neutral", // everything else: meetings, admin, social
]);

export type ActivityColour = z.infer<typeof activityColourSchema>;

export const activityTypeSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  colour: activityColourSchema,
  /** Read by call-ups (#16) to decide which activities get a call-up tab. */
  supportsCallUps: z.boolean(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
});

export type ActivityType = z.infer<typeof activityTypeSchema>;

/**
 * The types every new team starts with (ADR-005). Seeded on team creation and
 * editable afterwards — they are ordinary rows, not protected system records.
 */
export const DEFAULT_ACTIVITY_TYPES: readonly {
  name: string;
  colour: ActivityColour;
  supportsCallUps: boolean;
}[] = [
  { name: "Training", colour: "green", supportsCallUps: false },
  { name: "Match", colour: "ink", supportsCallUps: true },
];

export const listActivityTypesInputSchema = z.object({
  teamId: z.string(),
  includeArchived: queryBooleanSchema.optional(),
});

export const listActivityTypesOutputSchema = z.object({
  activityTypes: z.array(activityTypeSchema),
});

export const createActivityTypeInputSchema = z.object({
  teamId: z.string(),
  name: z.string().min(1).max(100),
  colour: activityColourSchema.optional(),
  supportsCallUps: z.boolean().optional(),
});

export const createActivityTypeOutputSchema = z.object({
  activityType: activityTypeSchema,
});

export const updateActivityTypeInputSchema = z.object({
  teamId: z.string(),
  activityTypeId: z.string(),
  name: z.string().min(1).max(100).optional(),
  colour: activityColourSchema.optional(),
  supportsCallUps: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateActivityTypeOutputSchema = z.object({
  activityType: activityTypeSchema,
});

export const archiveActivityTypeInputSchema = z.object({
  teamId: z.string(),
  activityTypeId: z.string(),
  archived: z.boolean(),
});

export const archiveActivityTypeOutputSchema = z.object({
  activityType: activityTypeSchema,
});

// ---------------------------------------------------------------------------
// Activities (issue #12)
//
// The calendar is the team's hub: trainings, matches and whatever else a team
// invents, all typed by a team-configured activity type (#11).
//
// Instants cross the wire as ISO 8601 strings with an offset — the client
// composes them from local wall time, the database stores timestamptz, and
// nothing in between has to agree on a timezone. Activities are cancelled,
// never deleted: a cancelled training still has to show up (struck through) so
// nobody turns up at the pitch for it.
// ---------------------------------------------------------------------------

/** An ISO 8601 instant carrying a zone — "…Z" or "…+02:00". */
const isoInstantSchema = z.iso.datetime({ offset: true });

export const activitySchema = z.object({
  id: z.string(),
  teamId: z.string(),
  activityTypeId: z.string(),
  /** Set when the activity came from a recurring series (#13). */
  seriesId: z.string().nullable(),
  /** Optional headline ("vs. Skiljebo SK"); falls back to the type name. */
  title: z.string().nullable(),
  startsAt: isoInstantSchema,
  /** Open-ended activities are allowed — a team party has no set finish. */
  endsAt: isoInstantSchema.nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  cancelled: z.boolean(),
});

export type Activity = z.infer<typeof activitySchema>;

/** An end that precedes its start is a typo, not a schedule. */
function endsAfterStart(value: {
  startsAt: string;
  endsAt?: string | null | undefined;
}): boolean {
  return (
    value.endsAt === undefined ||
    value.endsAt === null ||
    new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime()
  );
}

const ENDS_BEFORE_START = {
  path: ["endsAt"],
  error: "The end time must come after the start time",
};

/**
 * `from`/`to` bound the window the calendar is showing — a month grid asks for
 * its own six weeks, the list view for a wider span. Both are optional; without
 * them the whole history comes back, which is fine for a team's first season
 * and cheap to page later.
 */
export const listActivitiesInputSchema = z.object({
  teamId: z.string(),
  from: isoInstantSchema.optional(),
  to: isoInstantSchema.optional(),
  activityTypeId: z.string().optional(),
  /** Narrows to a season's date range (#13); combines with `from`/`to`. */
  seasonId: z.string().optional(),
});

export const listActivitiesOutputSchema = z.object({
  activities: z.array(activitySchema),
});

export const getActivityInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
});

export const getActivityOutputSchema = z.object({
  activity: activitySchema,
});

/**
 * Fields accepted when creating or updating an activity. Exported so the
 * frontend derives its form validation from the same rules the API enforces
 * (ADR-007) instead of restating them.
 */
export const activityWriteFields = {
  activityTypeId: z.string().min(1),
  title: z.string().max(100).nullable(),
  startsAt: isoInstantSchema,
  endsAt: isoInstantSchema.nullable(),
  location: z.string().max(200).nullable(),
  notes: z.string().max(2000).nullable(),
};

export const createActivityInputSchema = z
  .object({
    teamId: z.string(),
    activityTypeId: activityWriteFields.activityTypeId,
    title: activityWriteFields.title.optional(),
    startsAt: activityWriteFields.startsAt,
    endsAt: activityWriteFields.endsAt.optional(),
    location: activityWriteFields.location.optional(),
    notes: activityWriteFields.notes.optional(),
  })
  .refine(endsAfterStart, ENDS_BEFORE_START);

export const createActivityOutputSchema = z.object({
  activity: activitySchema,
});

/**
 * Every field is optional, so start/end cannot be checked against each other
 * here — a request may change only one of them. The handler validates the
 * merged row instead.
 */
/**
 * Which occurrences an edit reaches (#13).
 *
 * `occurrence` is the default and the only meaningful value for a one-off.
 * `following` also rewrites every later occurrence in the same series *and*
 * the series template — see `updateActivity` for exactly what carries over.
 */
export const activityEditScopeSchema = z.enum(["occurrence", "following"]);

export type ActivityEditScope = z.infer<typeof activityEditScopeSchema>;

export const updateActivityInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
  scope: activityEditScopeSchema.optional(),
  activityTypeId: activityWriteFields.activityTypeId.optional(),
  title: activityWriteFields.title.optional(),
  startsAt: activityWriteFields.startsAt.optional(),
  endsAt: activityWriteFields.endsAt.optional(),
  location: activityWriteFields.location.optional(),
  notes: activityWriteFields.notes.optional(),
});

export const updateActivityOutputSchema = z.object({
  activity: activitySchema,
});

export const setActivityCancelledInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
  cancelled: z.boolean(),
});

export const setActivityCancelledOutputSchema = z.object({
  activity: activitySchema,
});

// ---------------------------------------------------------------------------
// Recurring activities (issue #13, ADR-008)
//
// A series is a **template**; the occurrences it generates are ordinary
// activities carrying `seriesId`. The template holds **local wall time**, not
// instants — a training is at 18:00 in the club's own timezone on both sides
// of a DST change — so it stores a time-of-day, a set of weekdays, a date
// range, and the IANA zone those are read in.
// ---------------------------------------------------------------------------

/** ISO weekday: 1 = Monday … 7 = Sunday, matching date-fns' `getISODay`. */
export const isoWeekdaySchema = z.number().int().min(1).max(7);

/** A local wall-clock time, "HH:mm" — never an instant. */
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** A local calendar date, "YYYY-MM-DD". */
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const activitySeriesSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  activityTypeId: z.string(),
  title: z.string().nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  weekdays: z.array(isoWeekdaySchema),
  startTime: localTimeSchema,
  endTime: localTimeSchema.nullable(),
  startsOn: localDateSchema,
  until: localDateSchema,
  timeZone: z.string(),
});

export type ActivitySeries = z.infer<typeof activitySeriesSchema>;

/**
 * A ceiling on one series. "Every Tuesday until 2099" is a typo, not a plan,
 * and generating it would put a hundred thousand rows on the calendar.
 */
export const MAX_SERIES_OCCURRENCES = 400;

export const createRecurringActivitiesInputSchema = z
  .object({
    teamId: z.string(),
    activityTypeId: activityWriteFields.activityTypeId,
    title: activityWriteFields.title.optional(),
    location: activityWriteFields.location.optional(),
    notes: activityWriteFields.notes.optional(),
    weekdays: z.array(isoWeekdaySchema).min(1),
    startTime: localTimeSchema,
    endTime: localTimeSchema.nullable().optional(),
    startsOn: localDateSchema,
    until: localDateSchema,
    /** The club's zone, e.g. "Europe/Stockholm" — the browser's own. */
    timeZone: z.string().min(1),
  })
  .refine((value) => value.until >= value.startsOn, {
    path: ["until"],
    error: "The last date must not precede the first",
  })
  .refine(
    (value) =>
      value.endTime === undefined ||
      value.endTime === null ||
      value.endTime > value.startTime,
    { path: ["endTime"], error: "The end time must come after the start time" }
  );

export const createRecurringActivitiesOutputSchema = z.object({
  series: activitySeriesSchema,
  activities: z.array(activitySchema),
});

// ---------------------------------------------------------------------------
// Seasons (issue #13)
//
// A season is a named date range and nothing more. Activities are not linked
// to one by foreign key — membership is derived from the start date falling
// inside the range, so correcting a season's dates re-answers the question for
// every activity at once.
// ---------------------------------------------------------------------------

export const seasonSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  startsOn: localDateSchema,
  endsOn: localDateSchema,
});

export type Season = z.infer<typeof seasonSchema>;

export const seasonWriteFields = {
  name: z.string().min(1).max(100),
  startsOn: localDateSchema,
  endsOn: localDateSchema,
};

export const listSeasonsInputSchema = z.object({
  teamId: z.string(),
});

export const listSeasonsOutputSchema = z.object({
  seasons: z.array(seasonSchema),
});

export const createSeasonInputSchema = z
  .object({
    teamId: z.string(),
    name: seasonWriteFields.name,
    startsOn: seasonWriteFields.startsOn,
    endsOn: seasonWriteFields.endsOn,
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    path: ["endsOn"],
    error: "The last date must not precede the first",
  });

export const createSeasonOutputSchema = z.object({
  season: seasonSchema,
});

/** Every field optional, so the handler validates the merged range. */
export const updateSeasonInputSchema = z.object({
  teamId: z.string(),
  seasonId: z.string(),
  name: seasonWriteFields.name.optional(),
  startsOn: seasonWriteFields.startsOn.optional(),
  endsOn: seasonWriteFields.endsOn.optional(),
});

export const updateSeasonOutputSchema = z.object({
  season: seasonSchema,
});

export const deleteSeasonInputSchema = z.object({
  teamId: z.string(),
  seasonId: z.string(),
});

export const deleteSeasonOutputSchema = z.object({
  deleted: z.literal(true),
});

// ---------------------------------------------------------------------------
// Attendance statuses (issue #14, ADR-005)
//
// Statuses are team configuration, not code: seeded with Present, Absent and
// Ill, and a team adds its own ("Late", "Injured"). They share the Kit palette
// tokens with activity types — three colour families and nothing else.
//
// `countsAsPresent` is what statistics (#15) sums. It is a separate flag
// rather than an inference from the name, because a team may well decide that
// "Late" counts and "Injured" does not, and neither name says so.
// ---------------------------------------------------------------------------

export const attendanceStatusSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  colour: activityColourSchema,
  countsAsPresent: z.boolean(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
});

export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

/**
 * The statuses every new team starts with (ADR-005). Ordinary rows, editable
 * afterwards — the order here is the order a coach taps through.
 */
export const DEFAULT_ATTENDANCE_STATUSES: readonly {
  name: string;
  colour: ActivityColour;
  countsAsPresent: boolean;
}[] = [
  { name: "Present", colour: "green", countsAsPresent: true },
  { name: "Absent", colour: "orange", countsAsPresent: false },
  { name: "Ill", colour: "amber", countsAsPresent: false },
];

export const listAttendanceStatusesInputSchema = z.object({
  teamId: z.string(),
  includeArchived: queryBooleanSchema.optional(),
});

export const listAttendanceStatusesOutputSchema = z.object({
  attendanceStatuses: z.array(attendanceStatusSchema),
});

export const createAttendanceStatusInputSchema = z.object({
  teamId: z.string(),
  name: z.string().min(1).max(100),
  colour: activityColourSchema.optional(),
  countsAsPresent: z.boolean().optional(),
});

export const createAttendanceStatusOutputSchema = z.object({
  attendanceStatus: attendanceStatusSchema,
});

export const updateAttendanceStatusInputSchema = z.object({
  teamId: z.string(),
  attendanceStatusId: z.string(),
  name: z.string().min(1).max(100).optional(),
  colour: activityColourSchema.optional(),
  countsAsPresent: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateAttendanceStatusOutputSchema = z.object({
  attendanceStatus: attendanceStatusSchema,
});

export const archiveAttendanceStatusInputSchema = z.object({
  teamId: z.string(),
  attendanceStatusId: z.string(),
  archived: z.boolean(),
});

export const archiveAttendanceStatusOutputSchema = z.object({
  attendanceStatus: attendanceStatusSchema,
});

// ---------------------------------------------------------------------------
// Attendance records (issue #14)
//
// One record per member per activity, or none at all — an unmarked member is
// the absence of a row, not a status called "unknown". In Kit that state is a
// dashed ring, and dashed always means "not decided yet".
//
// Recording is a bulk write: the coach marks the roster standing at the side
// of the pitch and saves once, rather than firing a request per tap on a
// connection that may not be there.
// ---------------------------------------------------------------------------

export const attendanceRecordSchema = z.object({
  activityId: z.string(),
  memberId: z.string(),
  statusId: z.string(),
  note: z.string().nullable(),
});

export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>;

export const listAttendanceInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
});

export const listAttendanceOutputSchema = z.object({
  records: z.array(attendanceRecordSchema),
});

/** A `null` status clears the member's mark, putting them back to unmarked. */
export const attendanceEntrySchema = z.object({
  memberId: z.string(),
  statusId: z.string().nullable(),
  note: z.string().max(500).nullable().optional(),
});

export const setAttendanceInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
  entries: z.array(attendanceEntrySchema),
});

export const setAttendanceOutputSchema = z.object({
  records: z.array(attendanceRecordSchema),
});

// ---------------------------------------------------------------------------
// Call-ups (issue #16) — the matchtrupp.
//
// One call-up per activity, holding the squad. An invitation exists for every
// selected member and starts as `pending`; #17 lets players and guardians
// answer it themselves.
//
// A call-up has a draft and a published state. Publishing is what tells the
// squad they are in it, so selecting fourteen names must be possible without
// anyone's phone buzzing on each tap.
// ---------------------------------------------------------------------------

export const callupResponseSchema = z.enum([
  "pending", // not decided yet — Kit's dashed ring
  "accepted",
  "declined",
]);

export type CallupResponse = z.infer<typeof callupResponseSchema>;

export const callupSchema = z.object({
  id: z.string(),
  activityId: z.string(),
  note: z.string().nullable(),
  published: z.boolean(),
});

export type Callup = z.infer<typeof callupSchema>;

/**
 * Who put the answer there (#17). A coach may answer on a member's behalf —
 * "he phoned to say he can't make it" — and when they do, the squad has to be
 * able to see that it came from the coach, and from which one.
 *
 * `onBehalf` is false when the responder was answering for themselves or for
 * a child they are guardian to, *including* when that person is also the
 * coach: answering for your own child is nobody's behalf but your own.
 */
export const callupResponderSchema = z.object({
  userId: z.string().nullable(),
  name: z.string().nullable(),
  onBehalf: z.boolean(),
});

export type CallupResponder = z.infer<typeof callupResponderSchema>;

export const callupInvitationSchema = z.object({
  memberId: z.string(),
  response: callupResponseSchema,
  /** When the member (or their guardian, or a coach) answered; null while pending. */
  respondedAt: isoInstantSchema.nullable(),
  /** The member's own words — "away that weekend". */
  responseNote: z.string().nullable(),
  /** null while pending. */
  respondedBy: callupResponderSchema.nullable(),
});

export type CallupInvitation = z.infer<typeof callupInvitationSchema>;

export const getCallupInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
});

export const getCallupOutputSchema = z.object({
  /** null until a squad is first saved — an activity has no call-up by default. */
  callup: callupSchema.nullable(),
  invitations: z.array(callupInvitationSchema),
});

/**
 * The squad, as a whole. Members not in the list are removed; members already
 * in it keep the answer they gave, so saving a squad again never silently
 * discards a reply.
 */
export const setCallupSquadInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
  memberIds: z.array(z.string()),
});

export const setCallupSquadOutputSchema = z.object({
  callup: callupSchema,
  invitations: z.array(callupInvitationSchema),
});

export const updateCallupInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
  note: z.string().max(2000).nullable().optional(),
  published: z.boolean().optional(),
});

export const updateCallupOutputSchema = z.object({
  callup: callupSchema,
});

// ---------------------------------------------------------------------------
// Call-up responses (issue #17)
//
// Players and guardians answer for themselves. A user may respond only for
// members they are *linked* to — themselves, or a child they are guardian for
// (#9). That check is the whole security surface of this feature: everything
// else here is a list.
//
// Only `accepted` and `declined` can be sent. `pending` is where an invitation
// starts, not somewhere a person can put it back to.
// ---------------------------------------------------------------------------

export const callupAnswerSchema = z.enum(["accepted", "declined"]);

export type CallupAnswer = z.infer<typeof callupAnswerSchema>;

export const respondToCallupInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
  /** Which linked member is answering — a guardian answers per child. */
  memberId: z.string(),
  response: callupAnswerSchema,
  note: z.string().max(500).nullable().optional(),
});

export const respondToCallupOutputSchema = z.object({
  invitation: callupInvitationSchema,
});

/** One call-up awaiting (or holding) an answer, for a member I am linked to. */
export const myCallupSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  activityId: z.string(),
  startsAt: isoInstantSchema,
  endsAt: isoInstantSchema.nullable(),
  title: z.string().nullable(),
  activityTypeId: z.string(),
  location: z.string().nullable(),
  /** The coach's note on the squad, if any. */
  callupNote: z.string().nullable(),
  memberId: z.string(),
  memberName: z.string(),
  response: callupResponseSchema,
  responseNote: z.string().nullable(),
  respondedBy: callupResponderSchema.nullable(),
});

export type MyCallup = z.infer<typeof myCallupSchema>;

export const myCallupsInputSchema = z.object({});

export const myCallupsOutputSchema = z.object({
  callups: z.array(myCallupSchema),
  /** What the dashboard (#20) shows as "unanswered". */
  pending: z.number().int(),
});

/** A call-up in the coach's overview, with its response tally. */
export const callupSummarySchema = z.object({
  activityId: z.string(),
  startsAt: isoInstantSchema,
  title: z.string().nullable(),
  activityTypeId: z.string(),
  location: z.string().nullable(),
  cancelled: z.boolean(),
  published: z.boolean(),
  squad: z.number().int(),
  accepted: z.number().int(),
  declined: z.number().int(),
  pending: z.number().int(),
});

export type CallupSummary = z.infer<typeof callupSummarySchema>;

export const listCallupsInputSchema = z.object({
  teamId: z.string(),
  /** Past call-ups are history; the default is what is still to come. */
  includePast: queryBooleanSchema.optional(),
});

export const listCallupsOutputSchema = z.object({
  callups: z.array(callupSummarySchema),
  /** Unanswered invitations across the listed call-ups, for #20. */
  pending: z.number().int(),
});

// ---------------------------------------------------------------------------
// Attendance statistics (issue #15)
//
// The rate is **attended ÷ marked**, not attended ÷ activities held. A session
// nobody took attendance at is unknown, not an absence, and counting it would
// quietly punish every member for the coach's forgotten phone. `activities` in
// the output is what the filters selected, so the gap between it and `marked`
// is exactly the coverage a coach may want to close.
//
// Cancelled activities are excluded everywhere — a called-off training is not
// a session anyone failed to attend.
// ---------------------------------------------------------------------------

export const attendanceStatsFilterSchema = z.object({
  teamId: z.string(),
  from: isoInstantSchema.optional(),
  to: isoInstantSchema.optional(),
  seasonId: z.string().optional(),
  activityTypeId: z.string().optional(),
  groupId: z.string().optional(),
});

export const memberAttendanceStatsSchema = z.object({
  memberId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  /** Marked with a status whose `countsAsPresent` is set. */
  attended: z.number().int(),
  /** Marked with any status — the denominator of `rate`. */
  marked: z.number().int(),
  /** null when nothing is marked yet: no rate can be honestly stated. */
  rate: z.number().nullable(),
});

export type MemberAttendanceStats = z.infer<typeof memberAttendanceStatsSchema>;

export const attendanceStatsOutputSchema = z.object({
  members: z.array(memberAttendanceStatsSchema),
  /** Activities the filters selected, cancelled ones excluded. */
  activities: z.number().int(),
  /** Attendance rate across the whole selection. */
  teamRate: z.number().nullable(),
});

/** One activity as it appears in a member's attendance history. */
export const memberAttendanceEntrySchema = z.object({
  activityId: z.string(),
  startsAt: isoInstantSchema,
  title: z.string().nullable(),
  activityTypeId: z.string(),
  /** null when the activity was held but this member was never marked. */
  statusId: z.string().nullable(),
});

export type MemberAttendanceEntry = z.infer<
  typeof memberAttendanceEntrySchema
>;

export const memberAttendanceInputSchema = z.object({
  teamId: z.string(),
  memberId: z.string(),
  /** Most recent first; the member page shows a window, not a career. */
  limit: z.number().int().min(1).max(200).optional(),
});

export const memberAttendanceOutputSchema = z.object({
  entries: z.array(memberAttendanceEntrySchema),
  stats: memberAttendanceStatsSchema,
});

// ---------------------------------------------------------------------------
// Router contract
//
// Defines the shape of every procedure (input + output schemas) without any
// implementation. The backend imports this contract and attaches handlers;
// the frontend imports the inferred AppRouter type for a fully-typed client.
// ---------------------------------------------------------------------------

export const contract = oc.router({
  // Explicit GET route so plain `curl /health` (e.g. the Docker Compose
  // healthcheck) works; the `echo` input is passed as a query parameter.
  health: oc
    .route({ method: "GET", path: "/health" })
    .input(healthInputSchema)
    .output(healthOutputSchema),
  me: oc
    .route({ method: "GET", path: "/me" })
    .input(meInputSchema)
    .output(meOutputSchema),
  myClubs: oc
    .route({ method: "GET", path: "/my-clubs" })
    .input(myClubsInputSchema)
    .output(myClubsOutputSchema),
  createClub: oc
    .route({ method: "POST", path: "/clubs" })
    .input(createClubInputSchema)
    .output(createClubOutputSchema),
  listRoles: oc
    .route({ method: "GET", path: "/roles" })
    .input(listRolesInputSchema)
    .output(listRolesOutputSchema),
  createRole: oc
    .route({ method: "POST", path: "/roles" })
    .input(createRoleInputSchema)
    .output(createRoleOutputSchema),
  updateRole: oc
    .route({ method: "POST", path: "/roles/update" })
    .input(updateRoleInputSchema)
    .output(updateRoleOutputSchema),
  deleteRole: oc
    .route({ method: "POST", path: "/roles/delete" })
    .input(deleteRoleInputSchema)
    .output(deleteRoleOutputSchema),
  createInvitation: oc
    .route({ method: "POST", path: "/invitations" })
    .input(createInvitationInputSchema)
    .output(createInvitationOutputSchema),
  listInvitations: oc
    .route({ method: "GET", path: "/invitations" })
    .input(listInvitationsInputSchema)
    .output(listInvitationsOutputSchema),
  revokeInvitation: oc
    .route({ method: "POST", path: "/invitations/revoke" })
    .input(revokeInvitationInputSchema)
    .output(revokeInvitationOutputSchema),
  getInvitation: oc
    .route({ method: "GET", path: "/invitations/resolve" })
    .input(getInvitationInputSchema)
    .output(getInvitationOutputSchema),
  acceptInvitation: oc
    .route({ method: "POST", path: "/invitations/accept" })
    .input(acceptInvitationInputSchema)
    .output(acceptInvitationOutputSchema),
  listMembers: oc
    .route({ method: "GET", path: "/members" })
    .input(listMembersInputSchema)
    .output(listMembersOutputSchema),
  getMember: oc
    .route({ method: "GET", path: "/members/get" })
    .input(getMemberInputSchema)
    .output(getMemberOutputSchema),
  createMember: oc
    .route({ method: "POST", path: "/members" })
    .input(createMemberInputSchema)
    .output(createMemberOutputSchema),
  updateMember: oc
    .route({ method: "POST", path: "/members/update" })
    .input(updateMemberInputSchema)
    .output(updateMemberOutputSchema),
  setMemberArchived: oc
    .route({ method: "POST", path: "/members/archive" })
    .input(setMemberArchivedInputSchema)
    .output(setMemberArchivedOutputSchema),
  listMemberFields: oc
    .route({ method: "GET", path: "/member-fields" })
    .input(listMemberFieldsInputSchema)
    .output(listMemberFieldsOutputSchema),
  createMemberField: oc
    .route({ method: "POST", path: "/member-fields" })
    .input(createMemberFieldInputSchema)
    .output(createMemberFieldOutputSchema),
  updateMemberField: oc
    .route({ method: "POST", path: "/member-fields/update" })
    .input(updateMemberFieldInputSchema)
    .output(updateMemberFieldOutputSchema),
  archiveMemberField: oc
    .route({ method: "POST", path: "/member-fields/archive" })
    .input(archiveMemberFieldInputSchema)
    .output(archiveMemberFieldOutputSchema),
  setMemberFieldValues: oc
    .route({ method: "POST", path: "/members/field-values" })
    .input(setMemberFieldValuesInputSchema)
    .output(setMemberFieldValuesOutputSchema),
  listMemberGuardians: oc
    .route({ method: "GET", path: "/members/guardians" })
    .input(listMemberGuardiansInputSchema)
    .output(listMemberGuardiansOutputSchema),
  addGuardian: oc
    .route({ method: "POST", path: "/members/guardians" })
    .input(addGuardianInputSchema)
    .output(addGuardianOutputSchema),
  removeGuardian: oc
    .route({ method: "POST", path: "/members/guardians/remove" })
    .input(removeGuardianInputSchema)
    .output(removeGuardianOutputSchema),
  listClubUsers: oc
    .route({ method: "GET", path: "/club-users" })
    .input(listClubUsersInputSchema)
    .output(listClubUsersOutputSchema),
  myMembers: oc
    .route({ method: "GET", path: "/my-members" })
    .input(myMembersInputSchema)
    .output(myMembersOutputSchema),
  listGroups: oc
    .route({ method: "GET", path: "/groups" })
    .input(listGroupsInputSchema)
    .output(listGroupsOutputSchema),
  createGroup: oc
    .route({ method: "POST", path: "/groups" })
    .input(createGroupInputSchema)
    .output(createGroupOutputSchema),
  renameGroup: oc
    .route({ method: "POST", path: "/groups/rename" })
    .input(renameGroupInputSchema)
    .output(renameGroupOutputSchema),
  deleteGroup: oc
    .route({ method: "POST", path: "/groups/delete" })
    .input(deleteGroupInputSchema)
    .output(deleteGroupOutputSchema),
  listGroupMembers: oc
    .route({ method: "GET", path: "/groups/members" })
    .input(listGroupMembersInputSchema)
    .output(listGroupMembersOutputSchema),
  setGroupMembers: oc
    .route({ method: "POST", path: "/groups/members" })
    .input(setGroupMembersInputSchema)
    .output(setGroupMembersOutputSchema),
  listMemberGroups: oc
    .route({ method: "GET", path: "/members/groups" })
    .input(listMemberGroupsInputSchema)
    .output(listMemberGroupsOutputSchema),
  listActivityTypes: oc
    .route({ method: "GET", path: "/activity-types" })
    .input(listActivityTypesInputSchema)
    .output(listActivityTypesOutputSchema),
  createActivityType: oc
    .route({ method: "POST", path: "/activity-types" })
    .input(createActivityTypeInputSchema)
    .output(createActivityTypeOutputSchema),
  updateActivityType: oc
    .route({ method: "POST", path: "/activity-types/update" })
    .input(updateActivityTypeInputSchema)
    .output(updateActivityTypeOutputSchema),
  archiveActivityType: oc
    .route({ method: "POST", path: "/activity-types/archive" })
    .input(archiveActivityTypeInputSchema)
    .output(archiveActivityTypeOutputSchema),
  listActivities: oc
    .route({ method: "GET", path: "/activities" })
    .input(listActivitiesInputSchema)
    .output(listActivitiesOutputSchema),
  getActivity: oc
    .route({ method: "GET", path: "/activities/get" })
    .input(getActivityInputSchema)
    .output(getActivityOutputSchema),
  createActivity: oc
    .route({ method: "POST", path: "/activities" })
    .input(createActivityInputSchema)
    .output(createActivityOutputSchema),
  updateActivity: oc
    .route({ method: "POST", path: "/activities/update" })
    .input(updateActivityInputSchema)
    .output(updateActivityOutputSchema),
  setActivityCancelled: oc
    .route({ method: "POST", path: "/activities/cancel" })
    .input(setActivityCancelledInputSchema)
    .output(setActivityCancelledOutputSchema),
  createRecurringActivities: oc
    .route({ method: "POST", path: "/activities/recurring" })
    .input(createRecurringActivitiesInputSchema)
    .output(createRecurringActivitiesOutputSchema),
  listSeasons: oc
    .route({ method: "GET", path: "/seasons" })
    .input(listSeasonsInputSchema)
    .output(listSeasonsOutputSchema),
  createSeason: oc
    .route({ method: "POST", path: "/seasons" })
    .input(createSeasonInputSchema)
    .output(createSeasonOutputSchema),
  updateSeason: oc
    .route({ method: "POST", path: "/seasons/update" })
    .input(updateSeasonInputSchema)
    .output(updateSeasonOutputSchema),
  deleteSeason: oc
    .route({ method: "POST", path: "/seasons/delete" })
    .input(deleteSeasonInputSchema)
    .output(deleteSeasonOutputSchema),
  listAttendanceStatuses: oc
    .route({ method: "GET", path: "/attendance-statuses" })
    .input(listAttendanceStatusesInputSchema)
    .output(listAttendanceStatusesOutputSchema),
  createAttendanceStatus: oc
    .route({ method: "POST", path: "/attendance-statuses" })
    .input(createAttendanceStatusInputSchema)
    .output(createAttendanceStatusOutputSchema),
  updateAttendanceStatus: oc
    .route({ method: "POST", path: "/attendance-statuses/update" })
    .input(updateAttendanceStatusInputSchema)
    .output(updateAttendanceStatusOutputSchema),
  archiveAttendanceStatus: oc
    .route({ method: "POST", path: "/attendance-statuses/archive" })
    .input(archiveAttendanceStatusInputSchema)
    .output(archiveAttendanceStatusOutputSchema),
  listAttendance: oc
    .route({ method: "GET", path: "/attendance" })
    .input(listAttendanceInputSchema)
    .output(listAttendanceOutputSchema),
  setAttendance: oc
    .route({ method: "POST", path: "/attendance" })
    .input(setAttendanceInputSchema)
    .output(setAttendanceOutputSchema),
  attendanceStats: oc
    .route({ method: "GET", path: "/attendance/stats" })
    .input(attendanceStatsFilterSchema)
    .output(attendanceStatsOutputSchema),
  memberAttendance: oc
    .route({ method: "GET", path: "/attendance/member" })
    .input(memberAttendanceInputSchema)
    .output(memberAttendanceOutputSchema),
  getCallup: oc
    .route({ method: "GET", path: "/callups" })
    .input(getCallupInputSchema)
    .output(getCallupOutputSchema),
  setCallupSquad: oc
    .route({ method: "POST", path: "/callups/squad" })
    .input(setCallupSquadInputSchema)
    .output(setCallupSquadOutputSchema),
  updateCallup: oc
    .route({ method: "POST", path: "/callups/update" })
    .input(updateCallupInputSchema)
    .output(updateCallupOutputSchema),
  respondToCallup: oc
    .route({ method: "POST", path: "/callups/respond" })
    .input(respondToCallupInputSchema)
    .output(respondToCallupOutputSchema),
  myCallups: oc
    .route({ method: "GET", path: "/my-callups" })
    .input(myCallupsInputSchema)
    .output(myCallupsOutputSchema),
  listCallups: oc
    .route({ method: "GET", path: "/callups/list" })
    .input(listCallupsInputSchema)
    .output(listCallupsOutputSchema),
});

/** Inferred contract type — used by the frontend to create a typed oRPC client. */
export type AppRouter = typeof contract;
