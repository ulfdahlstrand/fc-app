/**
 * Previewing a SportAdmin import (#63).
 *
 * A dry run and nothing else: it reads the roster, works out what a commit
 * would do, and returns that. No statement here writes. The commit itself
 * arrives in #64 and will reuse the matching below.
 */
import type { Kysely } from "kysely";
import {
  normaliseForMatch,
  parsePersonalId,
  type ImportChange,
  type ImportError,
  type ImportRow,
  type ImportRowResult,
} from "@fc-app/contracts";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import {
  buildMatchIndex,
  collectGuardianEmails,
  findFileCollisions,
  matchImportRow,
  type ExistingMember,
} from "../members/import-match.js";
import { loadPersonalIdsForMatching } from "../members/personal-id.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";

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
}

/**
 * Archived members are included on purpose: someone archived last season is
 * still in the export, and matching them is what stops the import from
 * creating a second copy of them (ADR-014 — absence means something).
 */
async function loadRoster(
  db: Kysely<Database>,
  teamId: string
): Promise<RosterSnapshot> {
  const memberRows = await db
    .selectFrom("members")
    .select([
      "id",
      "first_name",
      "last_name",
      "birth_date",
      "email",
      "external_ref",
    ])
    .where("team_id", "=", teamId)
    .execute();

  const personalIds = await loadPersonalIdsForMatching(db, teamId);

  const members: ExistingMember[] = memberRows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthDate: row.birth_date,
    email: row.email,
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
    fieldNames: new Set(
      definitions.map((row) => normaliseForMatch(row.name))
    ),
  };
}

/** An e-mail identifies a contact; without one, their name has to. */
function contactKey(name: string, email: string | null): string {
  return email ? `email:${normaliseForMatch(email)}` : `name:${normaliseForMatch(name)}`;
}

/** An empty cell means "unknown", never "clear this" (ADR-014's reading). */
function scalarChange(
  field: string,
  before: string | null,
  after: string | null
): ImportChange | null {
  if (after === null || after.trim() === "") return null;
  if (before !== null && normaliseForMatch(before) === normaliseForMatch(after)) {
    return null;
  }
  return { field, from: before, to: after, redacted: false };
}

export const previewMemberImportHandler = os.previewMemberImport.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    await requireTeamPermission(db, user.id, input.teamId, "members.import");

    const roster = await loadRoster(db, input.teamId);
    const index = buildMatchIndex(roster.members);
    const byId = new Map(roster.members.map((member) => [member.id, member]));
    const guardianEmails = collectGuardianEmails(input.rows);

    // Pass one: parse and match every row, so collisions between rows can be
    // seen before any of them is described as an update.
    const resolved = input.rows.map((row) => {
      const errors: ImportError[] = [];
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

      // The number is free only if nobody else in the team holds it.
      if (personalId !== null) {
        const holder = index.byPersonalId.get(personalId);
        if (holder !== undefined && memberId !== null && holder !== memberId) {
          errors.push({ code: "personalIdInUse", detail: null });
        }
      }

      return { row, errors, personalId, birthDate, memberId, outcome };
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

    const rows: ImportRowResult[] = resolved.map((entry) => {
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
          matchedBy: entry.outcome.kind === "matched" ? entry.outcome.matchedBy : null,
          changes: [],
          errors,
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
        push(scalarChange(field, known?.get(normaliseForMatch(field)) ?? null, value));
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
        matchedBy: entry.outcome.kind === "matched" ? entry.outcome.matchedBy : null,
        changes,
        errors: [],
        newContacts,
      };
    });

    return {
      rows,
      summary: {
        created: rows.filter((row) => row.outcome === "new").length,
        updated: rows.filter((row) => row.outcome === "update").length,
        unchanged: rows.filter((row) => row.outcome === "unchanged").length,
        errors: rows.filter((row) => row.outcome === "error").length,
      },
      newGroups,
      newCustomFields,
    };
  }
);
