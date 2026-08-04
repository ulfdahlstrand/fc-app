/**
 * Deciding what a SportAdmin import would do (#63, #64).
 *
 * One planner, two consumers: the preview returns this untouched, and the
 * commit executes it. Keeping the decision in a single place is what makes
 * "importing the same file twice changes nothing" a property of the code
 * rather than a coincidence between two implementations.
 *
 * Nothing here writes.
 */
import type { Kysely } from "kysely";
import {
  normaliseForMatch,
  parsePersonalId,
  type ImportChange,
  type ImportError,
  type ImportRow,
  type ImportRowResult,
  type ImportSummary,
} from "@fc-app/contracts";
import type { Database } from "../db/types.js";
import {
  buildMatchIndex,
  collectGuardianEmails,
  findFileCollisions,
  matchImportRow,
  type ExistingMember,
} from "./import-match.js";
import { loadClubRegister, type KnownPerson } from "./personal-id.js";

/** Everything the preview compares against, read once. */
interface RosterSnapshot {
  members: ExistingMember[];
  /** member id → custom field name → value. */
  customFields: Map<string, Map<string, string>>;
  /** member id → group names they already belong to, normalised. */
  groups: Map<string, Set<string>>;
  /** member id → contacts they already have, keyed by e-mail or by name. */
  contacts: Map<string, Set<string>>;
  /** Group names that exist in the team, normalised. */
  groupNames: Set<string>;
  /** Custom field definition names that exist in the team, normalised. */
  fieldNames: Set<string>;
  /**
   * Everyone the *club* already knows by personnummer, with the teams they
   * play in. A person is club-wide; a member is that person in one team
   * (ADR-023).
   */
  register: Map<string, KnownPerson>;
}

/**
 * Archived members are included on purpose: someone archived last season is
 * still in the export, and matching them is what stops the import from
 * creating a second copy of them (ADR-014 — absence means something).
 */
async function loadRoster(
  db: Kysely<Database>,
  teamId: string,
  clubId: string
): Promise<RosterSnapshot> {
  const memberRows = await db
    .selectFrom("members")
    .select([
      "id",
      "first_name",
      "last_name",
      "birth_date",
      "email",
      "phone",
      "external_ref"
    ])
    .where("team_id", "=", teamId)
    .execute();

  const register = await loadClubRegister(db, clubId);

  // The team's own view of the register: matching a *member* stays scoped to
  // this team even though the person is not.
  const personalIds = new Map<string, string>();
  for (const person of register.values()) {
    for (const member of person.members) {
      if (member.teamId === teamId) {
        personalIds.set(member.memberId, person.personalId);
      }
    }
  }

  const members: ExistingMember[] = memberRows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthDate: row.birth_date,
    email: row.email,
    phone: row.phone,
    externalRef: row.external_ref,
    personalId: personalIds.get(row.id) ?? null,
  }));

  const memberIds = members.map((member) => member.id);

  const definitions = await db
    .selectFrom("member_field_definitions")
    .select(["id", "name"])
    .where("team_id", "=", teamId)
    .where("archived", "=", false)
    .execute();
  const definitionNames = new Map(definitions.map((d) => [d.id, d.name]));

  const customFields = new Map<string, Map<string, string>>();
  const groups = new Map<string, Set<string>>();
  const contacts = new Map<string, Set<string>>();

  if (memberIds.length > 0) {
    const valueRows = await db
      .selectFrom("member_field_values")
      .select(["member_id", "definition_id", "value"])
      .where("member_id", "in", memberIds)
      .execute();
    for (const row of valueRows) {
      const name = definitionNames.get(row.definition_id);
      if (name === undefined) continue;
      const forMember = customFields.get(row.member_id) ?? new Map();
      forMember.set(normaliseForMatch(name), row.value);
      customFields.set(row.member_id, forMember);
    }

    const groupRows = await db
      .selectFrom("group_members")
      .innerJoin("groups", "groups.id", "group_members.group_id")
      .select(["group_members.member_id", "groups.name"])
      .where("group_members.member_id", "in", memberIds)
      .execute();
    for (const row of groupRows) {
      const forMember = groups.get(row.member_id) ?? new Set();
      forMember.add(normaliseForMatch(row.name));
      groups.set(row.member_id, forMember);
    }

    const contactRows = await db
      .selectFrom("member_contacts")
      .select(["member_id", "name", "email"])
      .where("member_id", "in", memberIds)
      .execute();
    for (const row of contactRows) {
      const forMember = contacts.get(row.member_id) ?? new Set();
      forMember.add(contactKey(row.name, row.email));
      contacts.set(row.member_id, forMember);
    }
  }

  const teamGroups = await db
    .selectFrom("groups")
    .select("name")
    .where("team_id", "=", teamId)
    .execute();

  return {
    members,
    customFields,
    groups,
    contacts,
    groupNames: new Set(teamGroups.map((row) => normaliseForMatch(row.name))),
    fieldNames: new Set(definitions.map((row) => normaliseForMatch(row.name))),
    register,
  };
}

/** An e-mail identifies a contact; without one, their name has to. */
export function contactKey(name: string, email: string | null): string {
  return email
    ? `email:${normaliseForMatch(email)}`
    : `name:${normaliseForMatch(name)}`;
}

/** An empty cell means "unknown", never "clear this" (ADR-014's reading). */
function scalarChange(
  field: string,
  before: string | null,
  after: string | null
): ImportChange | null {
  if (after === null || after.trim() === "") return null;
  if (
    before !== null &&
    normaliseForMatch(before) === normaliseForMatch(after)
  ) {
    return null;
  }
  return { field, from: before, to: after, redacted: false };
}

/**
 * Change fields that map to a column on `members`. Anything else in a diff is
 * a custom field or a group, which the commit writes elsewhere.
 */
export const MEMBER_COLUMNS: Record<string, string> = {
  firstName: "first_name",
  lastName: "last_name",
  email: "email",
  phone: "phone",
  externalRef: "external_ref",
  birthDate: "birth_date",
};

/** What the commit needs to carry out one row, beyond what it displays. */
export interface ImportAction {
  row: ImportRow;
  /** The member to update, or null to create one. */
  memberId: string | null;
  /** Normalised twelve digits, or null. */
  personalId: string | null;
  birthDate: string | null;
  /** Field → new value, exactly as the preview reported it. Empty for new. */
  updates: Record<string, string>;
}

export interface ImportPlan {
  results: ImportRowResult[];
  summary: ImportSummary;
  newGroups: string[];
  newCustomFields: string[];
  /** Only the rows worth writing: errors and unchanged rows are left out. */
  actions: ImportAction[];
}

/**
 * Works out, against the current roster, what each row of the file would do.
 * `db` may be a transaction, so the commit plans and writes atomically.
 */
export async function buildImportPlan(
  db: Kysely<Database>,
  teamId: string,
  clubId: string,
  inputRows: ImportRow[]
): Promise<ImportPlan> {
  const roster = await loadRoster(db, teamId, clubId);
  const index = buildMatchIndex(roster.members);
  const byId = new Map(roster.members.map((member) => [member.id, member]));
  const guardianEmails = collectGuardianEmails(inputRows);

  // Pass one: parse and match every row, so collisions between rows can be
  // seen before any of them is described as an update.
  const resolved = inputRows.map((row) => {
    const errors: ImportError[] = [];
    const warnings: ImportError[] = [];
    let personalId: string | null = null;
    let birthDate: string | null = null;

    if (row.personalId !== null && row.personalId.trim() !== "") {
      const parsed = parsePersonalId(row.personalId);
      if (parsed.ok) {
        personalId = parsed.value.value;
        birthDate = parsed.value.birthDate;
      } else {
        errors.push({ code: "invalidPersonalId", detail: null });
      }
    }

    const outcome = matchImportRow(
      index,
      {
        rowNumber: row.rowNumber,
        personalId,
        externalRef: row.externalRef,
        firstName: row.firstName,
        lastName: row.lastName,
        birthDate,
        email: row.email,
      },
      guardianEmails
    );

    if (outcome.kind === "ambiguous") {
      errors.push({ code: "ambiguousMatch", detail: null });
    }

    const memberId = outcome.kind === "matched" ? outcome.memberId : null;

    // The number is free only if nobody else in *this team* holds it. Across
    // teams it is not a clash at all — it is one person in two age groups.
    if (personalId !== null) {
      const holder = index.byPersonalId.get(personalId);
      if (holder !== undefined && memberId !== null && holder !== memberId) {
        errors.push({ code: "personalIdInUse", detail: null });
      }

      // Already in the club, but not yet in this team. The row still imports:
      // it becomes a second membership for one person, which is what moving up
      // an age group looks like. Said out loud because a club admin importing
      // one team should know they just touched someone from another (ADR-023).
      const known = roster.register.get(personalId);
      const elsewhere = known?.members.filter(
        (member) => member.teamId !== teamId
      );
      if (holder === undefined && elsewhere !== undefined && elsewhere.length > 0) {
        warnings.push({ code: "alreadyInAnotherTeam", detail: null });
      }
    }

    return { row, errors, warnings, personalId, birthDate, memberId, outcome };
  });

  const collisions = findFileCollisions(
    resolved.map((entry) => ({
      rowNumber: entry.row.rowNumber,
      personalId: entry.personalId,
      memberId: entry.memberId,
    }))
  );

  const newGroups: string[] = [];
  const seenNewGroups = new Set<string>();
  const newCustomFields: string[] = [];
  const seenNewFields = new Set<string>();

  const results: ImportRowResult[] = resolved.map((entry) => {
    const { row } = entry;
    const errors = [...entry.errors];

    const clash = collisions.get(row.rowNumber);
    if (clash !== undefined) {
      errors.push({ code: "duplicateInFile", detail: String(clash) });
    }

    // Group and field names are collected even for failing rows: the mapping
    // step's question — "what will this file add to my team?" — does not
    // depend on whether one row's check digit is wrong.
    for (const group of row.groups) {
      const key = normaliseForMatch(group);
      if (roster.groupNames.has(key) || seenNewGroups.has(key)) continue;
      seenNewGroups.add(key);
      newGroups.push(group);
    }
    for (const field of Object.keys(row.customFields)) {
      const key = normaliseForMatch(field);
      if (roster.fieldNames.has(key) || seenNewFields.has(key)) continue;
      seenNewFields.add(key);
      newCustomFields.push(field);
    }

    const name = `${row.firstName} ${row.lastName}`.trim();
    const existing = entry.memberId ? byId.get(entry.memberId) : undefined;

    if (errors.length > 0) {
      return {
        rowNumber: row.rowNumber,
        name,
        outcome: "error",
        memberId: entry.memberId,
        matchedBy:
          entry.outcome.kind === "matched" ? entry.outcome.matchedBy : null,
        changes: [],
        errors,
        warnings: entry.warnings,
        newContacts: [],
      };
    }

    const newContacts = row.contacts
      .filter((contact) => {
        const known = existing ? roster.contacts.get(existing.id) : undefined;
        return !known?.has(contactKey(contact.name, contact.email));
      })
      .map((contact) => contact.name);

    if (!existing) {
      return {
        rowNumber: row.rowNumber,
        name,
        outcome: "new",
        memberId: null,
        matchedBy: null,
        changes: [],
        errors: [],
        warnings: entry.warnings,
        newContacts,
      };
    }

    const changes: ImportChange[] = [];
    const push = (change: ImportChange | null): void => {
      if (change) changes.push(change);
    };

    push(scalarChange("firstName", existing.firstName, row.firstName));
    push(scalarChange("lastName", existing.lastName, row.lastName));
    push(scalarChange("email", existing.email, row.email));
    push(scalarChange("phone", existing.phone, row.phone));
    push(scalarChange("externalRef", existing.externalRef, row.externalRef));

    // Reported as changed, never shown — neither value, either side (ADR-022).
    if (entry.personalId !== null && existing.personalId !== entry.personalId) {
      changes.push({
        field: "personalId",
        from: null,
        to: null,
        redacted: true,
      });
    }
    if (entry.birthDate !== null && existing.birthDate !== entry.birthDate) {
      push(scalarChange("birthDate", existing.birthDate, entry.birthDate));
    }

    const known = roster.customFields.get(existing.id);
    for (const [field, value] of Object.entries(row.customFields)) {
      push(
        scalarChange(
          field,
          known?.get(normaliseForMatch(field)) ?? null,
          value
        )
      );
    }

    const memberGroups = roster.groups.get(existing.id);
    const joining = row.groups.filter(
      (group) => !memberGroups?.has(normaliseForMatch(group))
    );
    if (joining.length > 0) {
      push({
        field: "groups",
        from: null,
        to: joining.join(", "),
        redacted: false,
      });
    }

    return {
      rowNumber: row.rowNumber,
      name,
      outcome:
        changes.length > 0 || newContacts.length > 0 ? "update" : "unchanged",
      memberId: existing.id,
      matchedBy:
        entry.outcome.kind === "matched" ? entry.outcome.matchedBy : null,
      changes,
      errors: [],
      warnings: entry.warnings,
      newContacts,
    };
  });

  const byRowNumber = new Map(
    results.map((result) => [result.rowNumber, result])
  );

  return {
    results,
    summary: {
      created: results.filter((row) => row.outcome === "new").length,
      updated: results.filter((row) => row.outcome === "update").length,
      unchanged: results.filter((row) => row.outcome === "unchanged").length,
      errors: results.filter((row) => row.outcome === "error").length,
    },
    newGroups,
    newCustomFields,
    actions: resolved.flatMap((entry) => {
      const result = byRowNumber.get(entry.row.rowNumber);
      // Error rows are never applied, and an unchanged row has nothing to do.
      if (
        !result ||
        result.outcome === "error" ||
        result.outcome === "unchanged"
      ) {
        return [];
      }
      return [
        {
          row: entry.row,
          memberId: entry.memberId,
          personalId: entry.personalId,
          birthDate: entry.birthDate,
          // Taken from the diff the preview showed, not re-derived — writing a
          // field the preview called unchanged is how "the commit does what
          // you were shown" quietly stops being true.
          updates: Object.fromEntries(
            result.changes
              .filter(
                (change) =>
                  MEMBER_COLUMNS[change.field] !== undefined &&
                  change.to !== null
              )
              .map((change) => [change.field, change.to as string])
          ),
        }
      ];
    }),
  };
}
