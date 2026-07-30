/** The procedure router: every input/output pair, with no implementation (ADR-001). */

import { oc } from "@orpc/contract";
import { createActivityInputSchema, createActivityOutputSchema, createRecurringActivitiesInputSchema, createRecurringActivitiesOutputSchema, getActivityInputSchema, getActivityOutputSchema, listActivitiesInputSchema, listActivitiesOutputSchema, setActivityCancelledInputSchema, setActivityCancelledOutputSchema, updateActivityInputSchema, updateActivityOutputSchema } from "./activities.js";
import { archiveAttendanceStatusInputSchema, archiveAttendanceStatusOutputSchema, attendanceStatsFilterSchema, attendanceStatsOutputSchema, createAttendanceStatusInputSchema, createAttendanceStatusOutputSchema, listAttendanceInputSchema, listAttendanceOutputSchema, listAttendanceStatusesInputSchema, listAttendanceStatusesOutputSchema, memberAttendanceInputSchema, memberAttendanceOutputSchema, setAttendanceInputSchema, setAttendanceOutputSchema, updateAttendanceStatusInputSchema, updateAttendanceStatusOutputSchema } from "./attendance.js";
import { meInputSchema, meOutputSchema } from "./auth.js";
import { getCallupInputSchema, getCallupOutputSchema, listCallupsInputSchema, listCallupsOutputSchema, myCallupsInputSchema, myCallupsOutputSchema, respondToCallupInputSchema, respondToCallupOutputSchema, setCallupSquadInputSchema, setCallupSquadOutputSchema, updateCallupInputSchema, updateCallupOutputSchema } from "./callups.js";
import { createClubInputSchema, createClubOutputSchema, myClubsInputSchema, myClubsOutputSchema } from "./clubs.js";
import { dashboardInputSchema, dashboardOutputSchema } from "./dashboard.js";
import { archiveActivityTypeInputSchema, archiveActivityTypeOutputSchema, createActivityTypeInputSchema, createActivityTypeOutputSchema, createGroupInputSchema, createGroupOutputSchema, deleteGroupInputSchema, deleteGroupOutputSchema, listActivityTypesInputSchema, listActivityTypesOutputSchema, listGroupMembersInputSchema, listGroupMembersOutputSchema, listGroupsInputSchema, listGroupsOutputSchema, listMemberGroupsInputSchema, listMemberGroupsOutputSchema, renameGroupInputSchema, renameGroupOutputSchema, setGroupMembersInputSchema, setGroupMembersOutputSchema, updateActivityTypeInputSchema, updateActivityTypeOutputSchema } from "./groups.js";
import { addGuardianInputSchema, addGuardianOutputSchema, listClubUsersInputSchema, listClubUsersOutputSchema, listMemberGuardiansInputSchema, listMemberGuardiansOutputSchema, myMembersInputSchema, myMembersOutputSchema, removeGuardianInputSchema, removeGuardianOutputSchema } from "./guardians.js";
import { healthInputSchema, healthOutputSchema } from "./health.js";
import { acceptInvitationInputSchema, acceptInvitationOutputSchema, createInvitationInputSchema, createInvitationOutputSchema, getInvitationInputSchema, getInvitationOutputSchema, listInvitationsInputSchema, listInvitationsOutputSchema, revokeInvitationInputSchema, revokeInvitationOutputSchema } from "./invitations.js";
import { archiveMemberFieldInputSchema, archiveMemberFieldOutputSchema, createMemberFieldInputSchema, createMemberFieldOutputSchema, createMemberInputSchema, createMemberOutputSchema, getMemberInputSchema, getMemberOutputSchema, listMemberFieldsInputSchema, listMemberFieldsOutputSchema, listMembersInputSchema, listMembersOutputSchema, setMemberArchivedInputSchema, setMemberArchivedOutputSchema, setMemberFieldValuesInputSchema, setMemberFieldValuesOutputSchema, updateMemberFieldInputSchema, updateMemberFieldOutputSchema, updateMemberInputSchema, updateMemberOutputSchema } from "./members.js";
import { createPostInputSchema, createPostOutputSchema, deletePostInputSchema, deletePostOutputSchema, getPostInputSchema, getPostOutputSchema, listPostsInputSchema, listPostsOutputSchema, setPostPublishedInputSchema, setPostPublishedOutputSchema, updatePostInputSchema, updatePostOutputSchema } from "./posts.js";
import { createRoleInputSchema, createRoleOutputSchema, deleteRoleInputSchema, deleteRoleOutputSchema, listRolesInputSchema, listRolesOutputSchema, updateRoleInputSchema, updateRoleOutputSchema } from "./roles.js";
import { createSeasonInputSchema, createSeasonOutputSchema, deleteSeasonInputSchema, deleteSeasonOutputSchema, listSeasonsInputSchema, listSeasonsOutputSchema, updateSeasonInputSchema, updateSeasonOutputSchema } from "./seasons.js";
import { archiveTrackingDefinitionInputSchema, archiveTrackingDefinitionOutputSchema, createTrackingDefinitionInputSchema, createTrackingDefinitionOutputSchema, listTrackingDefinitionsInputSchema, listTrackingDefinitionsOutputSchema, memberTrackingInputSchema, memberTrackingOutputSchema, setTrackingEntryInputSchema, setTrackingEntryOutputSchema, trackingMatrixInputSchema, trackingMatrixOutputSchema, updateTrackingDefinitionInputSchema, updateTrackingDefinitionOutputSchema } from "./tracking.js";

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
  listPosts: oc
    .route({ method: "GET", path: "/posts" })
    .input(listPostsInputSchema)
    .output(listPostsOutputSchema),
  getPost: oc
    .route({ method: "GET", path: "/posts/get" })
    .input(getPostInputSchema)
    .output(getPostOutputSchema),
  createPost: oc
    .route({ method: "POST", path: "/posts" })
    .input(createPostInputSchema)
    .output(createPostOutputSchema),
  updatePost: oc
    .route({ method: "POST", path: "/posts/update" })
    .input(updatePostInputSchema)
    .output(updatePostOutputSchema),
  setPostPublished: oc
    .route({ method: "POST", path: "/posts/publish" })
    .input(setPostPublishedInputSchema)
    .output(setPostPublishedOutputSchema),
  deletePost: oc
    .route({ method: "POST", path: "/posts/delete" })
    .input(deletePostInputSchema)
    .output(deletePostOutputSchema),
  listTrackingDefinitions: oc
    .route({ method: "GET", path: "/tracking/definitions" })
    .input(listTrackingDefinitionsInputSchema)
    .output(listTrackingDefinitionsOutputSchema),
  createTrackingDefinition: oc
    .route({ method: "POST", path: "/tracking/definitions" })
    .input(createTrackingDefinitionInputSchema)
    .output(createTrackingDefinitionOutputSchema),
  updateTrackingDefinition: oc
    .route({ method: "POST", path: "/tracking/definitions/update" })
    .input(updateTrackingDefinitionInputSchema)
    .output(updateTrackingDefinitionOutputSchema),
  archiveTrackingDefinition: oc
    .route({ method: "POST", path: "/tracking/definitions/archive" })
    .input(archiveTrackingDefinitionInputSchema)
    .output(archiveTrackingDefinitionOutputSchema),
  trackingMatrix: oc
    .route({ method: "GET", path: "/tracking/matrix" })
    .input(trackingMatrixInputSchema)
    .output(trackingMatrixOutputSchema),
  setTrackingEntry: oc
    .route({ method: "POST", path: "/tracking/entries" })
    .input(setTrackingEntryInputSchema)
    .output(setTrackingEntryOutputSchema),
  memberTracking: oc
    .route({ method: "GET", path: "/tracking/member" })
    .input(memberTrackingInputSchema)
    .output(memberTrackingOutputSchema),
  dashboard: oc
    .route({ method: "GET", path: "/dashboard" })
    .input(dashboardInputSchema)
    .output(dashboardOutputSchema),
});

/** Inferred contract type — used by the frontend to create a typed oRPC client. */
export type AppRouter = typeof contract;
