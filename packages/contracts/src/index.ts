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
});

/** Inferred contract type — used by the frontend to create a typed oRPC client. */
export type AppRouter = typeof contract;
