/**
 * The single place a member row becomes a `Member` on the wire.
 *
 * It exists so ADR-022's claim holds: the personnummer arrives here already
 * masked or not, decided by `personal-id.ts`, and no procedure can widen that
 * gate by assembling the DTO itself.
 */
import type { Selectable } from "kysely";
import type { Member } from "@fc-app/contracts";
import type { MembersTable } from "../db/types.js";

export function toMember(
  row: Selectable<MembersTable>,
  customFields: Record<string, string>,
  personalId: string | null
): Member {
  return {
    id: row.id,
    teamId: row.team_id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthYear: row.birth_year,
    birthDate: row.birth_date,
    personalId,
    externalRef: row.external_ref,
    email: row.email,
    phone: row.phone,
    archived: row.archived,
    customFields,
  };
}
