import { createClubHandler } from "./procedures/create-club.js";
import { healthHandler } from "./procedures/health.js";
import {
  acceptInvitationHandler,
  createInvitationHandler,
  getInvitationHandler,
  listInvitationsHandler,
  revokeInvitationHandler,
} from "./procedures/invitations.js";
import { meHandler } from "./procedures/me.js";
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
});

/** AppRouter type — re-exported for use in tests and future tooling. */
export type AppRouter = typeof router;
