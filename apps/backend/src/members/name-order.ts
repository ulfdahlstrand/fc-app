/**
 * The SQL mirror of `compareMemberNames` (ADR-010): first name, then last
 * name, collated as Swedish.
 *
 * The explicit `COLLATE` is not decoration. Neither cluster this app runs on
 * is Swedish-collated — a fresh Postgres 16 comes up `C.UTF-8` — and under
 * that collation these two orders disagree on every name starting with Å, Ä
 * or Ö:
 *
 * ```
 * C.UTF-8              Bea | bo | Ärna | Åke | Örjan | Östen
 * sv-SE-x-icu          Bea | bo | Åke | Ärna | Örjan | Östen
 * localeCompare(…,sv)  Bea | bo | Åke | Ärna | Örjan | Östen
 * ```
 *
 * `Ärna` before `Åke` is wrong in Swedish, and it is what the roster does
 * today. Any query that orders member names uses this, so the list the server
 * sorts and the list the browser sorts cannot drift apart.
 */

import { sql, type RawBuilder } from "kysely";

const COLLATION = "sv-SE-x-icu";

function collated(column: string): RawBuilder<string> {
  // The column name is a literal from the call sites below, never input.
  return sql.raw(`${column} COLLATE "${COLLATION}"`);
}

/**
 * `ORDER BY` fragments for a member's name, in reading order. Spread into a
 * query: `.orderBy(first).orderBy(last)`.
 *
 * Pass the table when the query joins and the columns need qualifying.
 */
export function memberNameOrder(
  table?: "members"
): [RawBuilder<string>, RawBuilder<string>] {
  const prefix = table === undefined ? "" : `${table}.`;
  return [collated(`${prefix}first_name`), collated(`${prefix}last_name`)];
}
