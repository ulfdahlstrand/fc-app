/** The oRPC router — one handler per contract procedure (ADR-001). */
import {
  createActivityHandler,
  createRecurringActivitiesHandler,
  getActivityHandler,
  listActivitiesHandler,
  setActivityCancelledHandler,
  updateActivityHandler,
} from "./procedures/activities.js";
import {
  listAttendanceHandler,
  setAttendanceHandler,
} from "./procedures/attendance.js";
import {
  attendanceStatsHandler,
  memberAttendanceHandler,
} from "./procedures/attendance-stats.js";
import {
  getCallupHandler,
  setCallupSquadHandler,
  updateCallupHandler,
} from "./procedures/callups.js";
import {
  listCallupsHandler,
  myCallupsHandler,
  respondToCallupHandler,
} from "./procedures/callup-responses.js";
import {
  archiveAttendanceStatusHandler,
  createAttendanceStatusHandler,
  listAttendanceStatusesHandler,
  updateAttendanceStatusHandler,
} from "./procedures/attendance-statuses.js";
import {
  createSeasonHandler,
  deleteSeasonHandler,
  listSeasonsHandler,
  updateSeasonHandler,
} from "./procedures/seasons.js";
import {
  archiveActivityTypeHandler,
  createActivityTypeHandler,
  listActivityTypesHandler,
  updateActivityTypeHandler,
} from "./procedures/activity-types.js";
import { createClubHandler } from "./procedures/create-club.js";
import {
  inviteMemberContactsHandler,
  pendingContactInvitesHandler,
} from "./procedures/contact-invitations.js";
import { dashboardHandler } from "./procedures/dashboard.js";
import {
  addGuardianHandler,
  listClubUsersHandler,
  listMemberContactsHandler,
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
import { previewAttendanceImportHandler } from "./procedures/attendance-import.js";
import {
  commitMemberImportHandler,
  previewMemberImportHandler,
} from "./procedures/member-import.js";
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
import {
  createPostHandler,
  deletePostHandler,
  getPostHandler,
  listPostsHandler,
  setPostPublishedHandler,
  updatePostHandler,
} from "./procedures/posts.js";
import {
  archiveTrackingDefinitionHandler,
  createTrackingDefinitionHandler,
  listTrackingDefinitionsHandler,
  memberTrackingHandler,
  setTrackingEntryHandler,
  trackingMatrixHandler,
  updateTrackingDefinitionHandler,
} from "./procedures/tracking.js";
import { os } from "./orpc.js";

/** The oRPC router — implements every procedure defined in the @fc-app/contracts package. */
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
  previewMemberImport: previewMemberImportHandler,
  previewAttendanceImport: previewAttendanceImportHandler,
  commitMemberImport: commitMemberImportHandler,
  listMemberContacts: listMemberContactsHandler,
  pendingContactInvites: pendingContactInvitesHandler,
  inviteMemberContacts: inviteMemberContactsHandler,
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
  createRecurringActivities: createRecurringActivitiesHandler,
  listSeasons: listSeasonsHandler,
  createSeason: createSeasonHandler,
  updateSeason: updateSeasonHandler,
  deleteSeason: deleteSeasonHandler,
  listAttendanceStatuses: listAttendanceStatusesHandler,
  createAttendanceStatus: createAttendanceStatusHandler,
  updateAttendanceStatus: updateAttendanceStatusHandler,
  archiveAttendanceStatus: archiveAttendanceStatusHandler,
  listAttendance: listAttendanceHandler,
  setAttendance: setAttendanceHandler,
  attendanceStats: attendanceStatsHandler,
  memberAttendance: memberAttendanceHandler,
  getCallup: getCallupHandler,
  setCallupSquad: setCallupSquadHandler,
  updateCallup: updateCallupHandler,
  respondToCallup: respondToCallupHandler,
  myCallups: myCallupsHandler,
  listCallups: listCallupsHandler,
  listPosts: listPostsHandler,
  getPost: getPostHandler,
  createPost: createPostHandler,
  updatePost: updatePostHandler,
  setPostPublished: setPostPublishedHandler,
  deletePost: deletePostHandler,
  listTrackingDefinitions: listTrackingDefinitionsHandler,
  createTrackingDefinition: createTrackingDefinitionHandler,
  updateTrackingDefinition: updateTrackingDefinitionHandler,
  archiveTrackingDefinition: archiveTrackingDefinitionHandler,
  trackingMatrix: trackingMatrixHandler,
  setTrackingEntry: setTrackingEntryHandler,
  memberTracking: memberTrackingHandler,
  dashboard: dashboardHandler,
});

/** AppRouter type — re-exported for use in tests and future tooling. */
export type AppRouter = typeof router;
