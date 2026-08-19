/**
 * What a team-scoped role does to the access someone already has (ADR-016, #74).
 *
 * A team-scoped membership *replaces* the club-wide one inside that team
 * (`requireTeamAccess`), it does not add to it. Handing the Coach role for one
 * team to a club admin therefore strips their admin rights in exactly that
 * team — invisibly, since they still hold them everywhere else. That is the
 * trap #74 closed for guardian invitations, and the one the coaches section
 * would walk straight back into.
 *
 * Two rules, because "changes what they can do" and "is a pure demotion" are
 * different questions and the section answers them differently: the first is
 * worth saying out loud, the second is worth refusing. Pure and separate
 * because rules that decide whether a write may touch someone's access deserve
 * their own test rather than an assertion buried in an integration case.
 */
import type { Permission } from "@fc-app/contracts";

/** True when `next` fails to grant something `current` grants. */
export function narrowsAccess(
  current: readonly Permission[],
  next: readonly Permission[],
): boolean {
  const granted = new Set(next);
  return current.some((permission) => !granted.has(permission));
}

/**
 * True when `next` grants strictly less than `current` — takes something away
 * and gives nothing back.
 *
 * This is the shape of "make the club admin a coach of P14": every coach
 * permission is one they already had, and `settings.club` is gone. Whereas a
 * club-wide player made coach of one team loses `callups.respond` there but
 * gains the whole coaching set, which is a role change an admin can mean, not
 * an accident — so it is not a demotion and is not refused.
 */
export function isDemotion(
  current: readonly Permission[],
  next: readonly Permission[],
): boolean {
  return narrowsAccess(current, next) && !narrowsAccess(next, current);
}
