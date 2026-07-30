/** An invitation's status, derived from its timestamps rather than stored. */
import type { InvitationStatus } from "@fc-app/contracts";

export interface InvitationLifecycle {
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/** Derives an invitation's status. */
export function invitationStatus(
  invitation: InvitationLifecycle,
  now: Date = new Date()
): InvitationStatus {
  if (invitation.revokedAt !== null) return "revoked";
  if (invitation.usedAt !== null) return "used";
  if (invitation.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}
