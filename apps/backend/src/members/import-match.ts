/**
 * Deciding which existing member a file row is (#63, ADR-016).
 *
 * Pure functions with their own tests, because getting this wrong is not a
 * cosmetic bug: a wrong match overwrites someone else's record, and a missed
 * one duplicates a child. When the answer would be a guess, these say so
 * instead of picking.
 */
import {
  normaliseForMatch,
  normaliseName,
  type ImportMatchReason,
} from "@fc-app/contracts";

/** A member already in the team, reduced to what matching looks at. */
export interface ExistingMember {
  id: string;
  firstName: string;
  lastName: string;
  /** `YYYY-MM-DD`, when one is known. */
  birthDate: string | null;
  email: string | null;
  externalRef: string | null;
  /** Twelve digits, or null. Loaded through `personal-id.ts`, never widened. */
  personalId: string | null;
}

/** A file row reduced the same way, after its personnummer has been parsed. */
export interface RowIdentity {
  rowNumber: number;
  /** Twelve digits, or null when the row had none or it did not parse. */
  personalId: string | null;
  externalRef: string | null;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  email: string | null;
}

export type MatchOutcome =
  | { kind: "matched"; memberId: string; matchedBy: ImportMatchReason }
  | { kind: "none" }
  /** Several members fit equally well; the caller must not choose. */
  | { kind: "ambiguous"; matchedBy: ImportMatchReason };

/**
 * Lookups built once per import rather than per row. A key that would be
 * ambiguous maps to null, so an ambiguous match is a fact about the data
 * rather than something each caller has to notice.
 */
export interface MatchIndex {
  byPersonalId: Map<string, string>;
  byExternalRef: Map<string, string>;
  byNameAndBirthDate: Map<string, string | null>;
  byEmail: Map<string, string | null>;
}

function addUnique(
  index: Map<string, string | null>,
  key: string,
  memberId: string
): void {
  index.set(key, index.has(key) ? null : memberId);
}

export function buildMatchIndex(members: ExistingMember[]): MatchIndex {
  const index: MatchIndex = {
    byPersonalId: new Map(),
    byExternalRef: new Map(),
    byNameAndBirthDate: new Map(),
    byEmail: new Map(),
  };

  for (const member of members) {
    // A personnummer and an external ref are unique per team in the database,
    // so these two cannot collide and are stored directly.
    if (member.personalId) index.byPersonalId.set(member.personalId, member.id);
    if (member.externalRef) {
      index.byExternalRef.set(normaliseForMatch(member.externalRef), member.id);
    }
    if (member.birthDate) {
      const key = `${normaliseName(member.firstName, member.lastName)}|${member.birthDate}`;
      addUnique(index.byNameAndBirthDate, key, member.id);
    }
    if (member.email) {
      addUnique(index.byEmail, normaliseForMatch(member.email), member.id);
    }
  }

  return index;
}

/**
 * Matches one row, in the order the plan sets out: personnummer, external ref,
 * name plus birth date, e-mail.
 *
 * `guardianEmails` holds every address the file gives as a *guardian's*. A
 * member's own e-mail is very often a parent's — an eight-year-old carries
 * their father's address — so matching on one would merge a child into their
 * parent. Those addresses are therefore not usable as identity.
 */
export function matchImportRow(
  index: MatchIndex,
  row: RowIdentity,
  guardianEmails: ReadonlySet<string>
): MatchOutcome {
  if (row.personalId) {
    const memberId = index.byPersonalId.get(row.personalId);
    // A personnummer match with a different name is still a match: people
    // change their names, and the number is what identifies them.
    if (memberId) return { kind: "matched", memberId, matchedBy: "personalId" };
  }

  if (row.externalRef) {
    const memberId = index.byExternalRef.get(normaliseForMatch(row.externalRef));
    if (memberId) {
      return { kind: "matched", memberId, matchedBy: "externalRef" };
    }
  }

  if (row.birthDate) {
    const key = `${normaliseName(row.firstName, row.lastName)}|${row.birthDate}`;
    if (index.byNameAndBirthDate.has(key)) {
      const memberId = index.byNameAndBirthDate.get(key) ?? null;
      return memberId === null
        ? { kind: "ambiguous", matchedBy: "nameAndBirthDate" }
        : { kind: "matched", memberId, matchedBy: "nameAndBirthDate" };
    }
  }

  if (row.email) {
    const email = normaliseForMatch(row.email);
    if (!guardianEmails.has(email) && index.byEmail.has(email)) {
      const memberId = index.byEmail.get(email) ?? null;
      return memberId === null
        ? { kind: "ambiguous", matchedBy: "email" }
        : { kind: "matched", memberId, matchedBy: "email" };
    }
  }

  return { kind: "none" };
}

/**
 * Every address the file offers as a guardian's, normalised. Built from the
 * whole file before any row is matched, because row 1's parent may be row 12's
 * member.
 */
export function collectGuardianEmails(
  rows: { contacts: { email: string | null }[] }[]
): Set<string> {
  const emails = new Set<string>();
  for (const row of rows) {
    for (const contact of row.contacts) {
      if (contact.email) emails.add(normaliseForMatch(contact.email));
    }
  }
  return emails;
}

/**
 * Rows that would collide with each other: the same personnummer twice, or two
 * rows resolving to one member. Returns row number → the row it clashes with,
 * for both sides of the pair, so neither is silently applied.
 */
export function findFileCollisions(
  rows: { rowNumber: number; personalId: string | null; memberId: string | null }[]
): Map<number, number> {
  const collisions = new Map<number, number>();
  const firstSeen = new Map<string, number>();

  for (const row of rows) {
    for (const key of [
      row.personalId === null ? null : `pnr:${row.personalId}`,
      row.memberId === null ? null : `member:${row.memberId}`,
    ]) {
      if (key === null) continue;
      const earlier = firstSeen.get(key);
      if (earlier === undefined) {
        firstSeen.set(key, row.rowNumber);
        continue;
      }
      collisions.set(row.rowNumber, earlier);
      if (!collisions.has(earlier)) collisions.set(earlier, row.rowNumber);
    }
  }

  return collisions;
}
