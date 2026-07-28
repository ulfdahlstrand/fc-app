import {
  createActivityHandler,
  getActivityHandler,
  listActivitiesHandler,
  setActivityCancelledHandler,
  updateActivityHandler,
} from "./procedures/activities.js";
import {
  archiveActivityTypeHandler,
  createActivityTypeHandler,
  listActivityTypesHandler,
  updateActivityTypeHandler,
} from "./procedures/activity-types.js";
import { createClubHandler } from "./procedures/create-club.js";
import {
  addGuardianHandler,
  listClubUsersHandler,
  listMemberGuardiansHandler,
  myMembersHandler,
  removeGuardianHandler,
} from "./procedures/guardians.js";
import { healthHandler } from "./procedures/health.js";
import {
  createGroupHandler,
  deleteGroupHandler,
  listGroupMembersHandler,
  listGroupsHandler,
  listMemberGroupsHandler,
  renameGroupHandler,
  setGroupMembersHandler,
} from "./procedures/groups.js";
import {
  acceptInvitationHandler,
  createInvitationHandler,
  getInvitationHandler,
  listInvitationsHandler,
  revokeInvitationHandler,
} from "./procedures/invitations.js";
import {
  archiveMemberFieldHandler,
  createMemberFieldHandler,
  listMemberFieldsHandler,
  setMemberFieldValuesHandler,
  updateMemberFieldHandler,
} from "./procedures/member-fields.js";
import { meHandler } from "./procedures/me.js";
import {
  createMemberHandler,
  getMemberHandler,
  listMembersHandler,
  setMemberArchivedHandler,
  updateMemberHandler,
} from "./procedures/members.js";
import { myClubsHandler } from "./procedures/my-clubs.js";
import {
  createRoleHandler,
  deleteRoleHandler,
  listRolesHandler,
  updateRoleHandler,
} from "./procedures/roles.js";
import { os } from "./orpc.js";

/**
 * The oRPC router — implements every procedure defined in the @fc-app/contracts
 * package. Adding a new procedure requires: (1) adding it to the contract, and
 * (2) adding its handler here.
 *
 * Handlers that need the database use getDb() internally at request time (not
 * at module-load time), keeping unit tests that import individual handler
 * files free from DATABASE_URL requirements.
 */
export const router = os.router({
  health: healthHandler,
  me: meHandler,
  myClubs: myClubsHandler,
  createClub: createClubHandler,
  listRoles: listRolesHandler,
  createRole: createRoleHandler,
  updateRole: updateRoleHandler,
  deleteRole: deleteRoleHandler,
  createInvitation: createInvitationHandler,
  listInvitations: listInvitationsHandler,
  revokeInvitation: revokeInvitationHandler,
  getInvitation: getInvitationHandler,
  acceptInvitation: acceptInvitationHandler,
  listMembers: listMembersHandler,
  getMember: getMemberHandler,
  createMember: createMemberHandler,
  updateMember: updateMemberHandler,
  setMemberArchived: setMemberArchivedHandler,
  listMemberFields: listMemberFieldsHandler,
  createMemberField: createMemberFieldHandler,
  updateMemberField: updateMemberFieldHandler,
  archiveMemberField: archiveMemberFieldHandler,
  setMemberFieldValues: setMemberFieldValuesHandler,
  listMemberGuardians: listMemberGuardiansHandler,
  addGuardian: addGuardianHandler,
  removeGuardian: removeGuardianHandler,
  listClubUsers: listClubUsersHandler,
  myMembers: myMembersHandler,
  listGroups: listGroupsHandler,
  createGroup: createGroupHandler,
  renameGroup: renameGroupHandler,
  deleteGroup: deleteGroupHandler,
  listGroupMembers: listGroupMembersHandler,
  setGroupMembers: setGroupMembersHandler,
  listMemberGroups: listMemberGroupsHandler,
  listActivityTypes: listActivityTypesHandler,
  createActivityType: createActivityTypeHandler,
  updateActivityType: updateActivityTypeHandler,
  archiveActivityType: archiveActivityTypeHandler,
  listActivities: listActivitiesHandler,
  getActivity: getActivityHandler,
  createActivity: createActivityHandler,
  updateActivity: updateActivityHandler,
  setActivityCancelled: setActivityCancelledHandler,
});

/** AppRouter type — re-exported for use in tests and future tooling. */
export type AppRouter = typeof router;
