import type { InvitationStatus } from "@fc-app/contracts";

export interface InvitationLifecycle {
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/**
 * Derives an invitation's status. Precedence: revoked > used > expired >
 * active, so a revoked-then-expired link still reads as "revoked".
 */
export function invitationStatus(
  invitation: InvitationLifecycle,
  now: Date = new Date()
): InvitationStatus {
  if (invitation.revokedAt !== null) return "revoked";
  if (invitation.usedAt !== null) return "used";
  if (invitation.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}
