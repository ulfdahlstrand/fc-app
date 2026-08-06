/**
 * Carrying out an import plan (#64).
 *
 * Everything here runs inside the caller's transaction. It only ever acts on
 * `plan.actions`, which excludes rows that errored and rows with nothing to
 * do — so a bad row costs its own line and nothing else, and re-importing an
 * unchanged file writes nothing at all.
 *
 * An absent value never clears a stored one. An empty cell in a spreadsheet
 * means "not filled in", not "delete what you know" (ADR-014's reading).
 */
import type { Kysely } from "kysely";
import { normaliseForMatch, normaliseName } from "@fc-app/contracts";
import type { Database } from "../db/types.js";
import { contactKey, MEMBER_COLUMNS, type ImportPlan } from "./import-plan.js";
import {
  recordMemberExternalId,
  SOURCE_SPORTADMIN,
  SOURCE_SPORTADMIN_MEMBER_NO,
} from "./external-ids.js";
import { setPersonalId } from "./personal-id.js";

function filled(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Group name → id, creating the ones the file introduces. */
async function ensureGroups(
  trx: Kysely<Database>,
  teamId: string,
  names: string[]
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  if (names.length === 0) return byName;

  const existing = await trx
    .selectFrom("groups")
    .select(["id", "name"])
    .where("team_id", "=", teamId)
    .execute();
  for (const row of existing) byName.set(normaliseForMatch(row.name), row.id);

  for (const name of names) {
    const key = normaliseForMatch(name);
    if (byName.has(key)) continue;
    const inserted = await trx
      .insertInto("groups")
      .values({ team_id: teamId, name })
      .returning("id")
      .executeTakeFirstOrThrow();
    byName.set(key, inserted.id);
  }
  return byName;
}

/**
 * Custom field name → definition id, creating what the file introduces.
 *
 * New definitions are text. A spreadsheet column carries no type, and
 * guessing one would silently reject the row that does not fit it; a team can
 * narrow the field afterwards in settings.
 */
async function ensureFieldDefinitions(
  trx: Kysely<Database>,
  teamId: string,
  names: string[]
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  if (names.length === 0) return byName;

  const existing = await trx
    .selectFrom("member_field_definitions")
    .select(["id", "name"])
    .where("team_id", "=", teamId)
    .where("archived", "=", false)
    .execute();
  for (const row of existing) byName.set(normaliseForMatch(row.name), row.id);

  for (const name of names) {
    const key = normaliseForMatch(name);
    if (byName.has(key)) continue;
    const inserted = await trx
      .insertInto("member_field_definitions")
      .values({
        team_id: teamId,
        name,
        field_type: "text",
        options: JSON.stringify([]),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    byName.set(key, inserted.id);
  }
  return byName;
}

/** Accounts that already exist for the guardians in this file, by e-mail. */
async function findUsersByEmail(
  trx: Kysely<Database>,
  emails: string[]
): Promise<Map<string, string>> {
  const byEmail = new Map<string, string>();
  if (emails.length === 0) return byEmail;
  const rows = await trx
    .selectFrom("users")
    .select(["id", "email"])
    .where("email", "in", emails)
    .execute();
  for (const row of rows) byEmail.set(normaliseForMatch(row.email), row.id);
  return byEmail;
}


/**
 * Points contacts at the roster row that is the same person — the coach who is
 * also `Målsman 2` on their child's line.
 *
 * Matched on name alone, deliberately. E-mail looks like the stronger key and
 * is the wrong one here: a child usually carries a parent's address, so
 * matching on it would link the parent's contact row to the *child*. Where two
 * members share a name the link is left unset rather than guessed.
 *
 * Runs after every member exists, because the coach's own row may be created
 * later in the file than the child whose guardian they are.
 */
async function linkContactsToMembers(
  trx: Kysely<Database>,
  teamId: string
): Promise<void> {
  const members = await trx
    .selectFrom("members")
    .select(["id", "first_name", "last_name"])
    .where("team_id", "=", teamId)
    .execute();

  const byName = new Map<string, string | null>();
  for (const member of members) {
    const key = normaliseName(member.first_name, member.last_name);
    byName.set(key, byName.has(key) ? null : member.id);
  }

  const contacts = await trx
    .selectFrom("member_contacts")
    .innerJoin("members", "members.id", "member_contacts.member_id")
    .select(["member_contacts.id", "member_contacts.name"])
    .where("members.team_id", "=", teamId)
    .where("member_contacts.linked_member_id", "is", null)
    .execute();

  for (const contact of contacts) {
    const memberId = byName.get(normaliseForMatch(contact.name));
    if (!memberId) continue;
    await trx
      .updateTable("member_contacts")
      .set({ linked_member_id: memberId })
      .where("id", "=", contact.id)
      .execute();
  }
}

export async function applyImportPlan(
  trx: Kysely<Database>,
  teamId: string,
  clubId: string,
  plan: ImportPlan
): Promise<void> {
  if (plan.actions.length === 0) return;

  const groupNames = [
    ...new Set(plan.actions.flatMap((action) => action.row.groups)),
  ];
  const fieldNames = [
    ...new Set(
      plan.actions.flatMap((action) => Object.keys(action.row.customFields))
    ),
  ];
  const contactEmails = [
    ...new Set(
      plan.actions.flatMap((action) =>
        action.row.contacts.flatMap((contact) =>
          contact.email ? [contact.email.trim()] : []
        )
      )
    ),
  ];

  const groups = await ensureGroups(trx, teamId, groupNames);
  const fields = await ensureFieldDefinitions(trx, teamId, fieldNames);
  const users = await findUsersByEmail(trx, contactEmails);

  for (const action of plan.actions) {
    const { row } = action;
    const email = filled(row.email);
    const phone = filled(row.phone);
    const externalRef = filled(row.externalRef);

    let memberId = action.memberId;
    if (memberId === null) {
      const inserted = await trx
        .insertInto("members")
        .values({
          team_id: teamId,
          first_name: row.firstName,
          last_name: row.lastName,
          birth_date: action.birthDate,
          birth_year: action.birthDate
            ? Number(action.birthDate.slice(0, 4))
            : null,
          external_ref: externalRef,
          email,
          phone,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      memberId = inserted.id;
    } else {
      // Only what the preview listed as changing. Re-deriving here would let
      // the commit touch fields the coach was told were untouched — an e-mail
      // that differs only in case, say.
      const updates: Record<string, string | number | Date> = {
        updated_at: new Date(),
      };
      for (const [field, value] of Object.entries(action.updates)) {
        const column = MEMBER_COLUMNS[field];
        if (column === undefined) continue;
        updates[column] = value;
        if (field === "birthDate") {
          updates["birth_year"] = Number(value.slice(0, 4));
        }
      }

      if (Object.keys(updates).length > 1) {
        await trx
          .updateTable("members")
          .set(updates)
          .where("id", "=", memberId)
          .where("team_id", "=", teamId)
          .execute();
      }
    }

    if (action.personalId !== null) {
      await setPersonalId(trx, {
        memberId,
        teamId,
        clubId,
        raw: action.personalId,
      });
    }

    // `Medlems Nr` is the club's own number, a different namespace from
    // SportAdmin's internal member id (#89). Recorded on the person rather
    // than only on the member row, so a re-import — or an import from
    // somewhere else entirely — has something stable to match on.
    if (externalRef !== null) {
      await recordMemberExternalId(trx, {
        memberId,
        clubId,
        source: SOURCE_SPORTADMIN_MEMBER_NO,
        externalId: externalRef,
      });
    }

    // The internal id, when the file carries one. This is the column the
    // attendance import matches on, so filling it here is what stops a
    // second import from having to trust names at all (#89).
    const sportAdminId = filled(row.sportAdminId);
    if (sportAdminId !== null) {
      await recordMemberExternalId(trx, {
        memberId,
        clubId,
        source: SOURCE_SPORTADMIN,
        externalId: sportAdminId,
      });
    }

    for (const [name, value] of Object.entries(row.customFields)) {
      const definitionId = fields.get(normaliseForMatch(name));
      const text = filled(value);
      if (definitionId === undefined || text === null) continue;
      await trx
        .insertInto("member_field_values")
        .values({ member_id: memberId, definition_id: definitionId, value: text })
        .onConflict((oc) =>
          oc.columns(["member_id", "definition_id"]).doUpdateSet({ value: text })
        )
        .execute();
    }

    for (const name of row.groups) {
      const groupId = groups.get(normaliseForMatch(name));
      if (groupId === undefined) continue;
      await trx
        .insertInto("group_members")
        .values({ group_id: groupId, member_id: memberId })
        .onConflict((oc) => oc.doNothing())
        .execute();
    }

    // Re-read rather than trusting the plan's view: this member may have been
    // created moments ago in this same loop.
    const known = new Set(
      (
        await trx
          .selectFrom("member_contacts")
          .select(["name", "email"])
          .where("member_id", "=", memberId)
          .execute()
      ).map((contact) => contactKey(contact.name, contact.email))
    );

    for (const [position, contact] of row.contacts.entries()) {
      const key = contactKey(contact.name, contact.email);
      if (known.has(key)) continue;
      known.add(key);
      const contactEmail = filled(contact.email);
      await trx
        .insertInto("member_contacts")
        .values({
          member_id: memberId,
          name: contact.name,
          relation: filled(contact.relation),
          email: contactEmail,
          phone: filled(contact.phone),
          // Linked straight away when the guardian already has an account;
          // otherwise #65 links them when they accept an invitation.
          user_id: contactEmail
            ? (users.get(normaliseForMatch(contactEmail)) ?? null)
            : null,
          sort_order: position,
        })
        .execute();
    }
  }

  await linkContactsToMembers(trx, teamId);
}
