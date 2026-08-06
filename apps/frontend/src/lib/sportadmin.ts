/**
 * Reading a SportAdmin member export (#63).
 *
 * The whole module rests on one fact about the file: **its header names are
 * not unique**. `E-post` appears three times — the member's, then one per
 * guardian — and `Relation` and `Telefon` twice. A parser keyed by header name
 * silently overwrites the member's e-mail with a parent's, which is the kind of
 * bug that looks like it worked. So columns are read by position, and the
 * repeats are resolved by the `Målsman N` header that opened the block they
 * sit in.
 *
 * Parsing happens here, in the browser, and only the mapped rows are sent. The
 * columns a coach skips never leave their machine.
 */
import type { ImportContact, ImportRow } from "@fc-app/contracts";

/** A member field the export can fill directly. */
export type BuiltinField =
  | "firstName"
  | "lastName"
  | "personalId"
  | "externalRef"
  /** SportAdmin's internal member id — the key the attendance import uses. */
  | "sportAdminId"
  | "email"
  | "phoneMobile"
  | "phoneHome"
  | "phoneWork"
  /** `Gruppkoppling` — "Spelare", "Tränare". Becomes a group. */
  | "group"
  /** `Grupp` — the SportAdmin team. Informational; the target team is chosen. */
  | "teamName";

export type ContactField = "name" | "relation" | "email" | "phone";

export type ColumnTarget =
  | { kind: "skip" }
  | { kind: "builtin"; field: BuiltinField }
  | { kind: "contact"; index: number; field: ContactField }
  | { kind: "custom"; name: string };

export interface ColumnPlan {
  index: number;
  header: string;
  target: ColumnTarget;
  /** Off until the coach turns it on. */
  enabled: boolean;
  /** Health data or similar — needs its own confirmation (GDPR). */
  sensitive: boolean;
  /** Blank in every row; hidden from the mapping step. */
  empty: boolean;
}

/** Header → member field. Everything absent here becomes a custom field. */
const BUILTIN_HEADERS: Record<string, BuiltinField> = {
  grupp: "teamName",
  gruppkoppling: "group",
  förnamn: "firstName",
  efternamn: "lastName",
  personnummer: "personalId",
  "medlems nr": "externalRef",
  "sportadmin-id": "sportAdminId",
  "sportadmin id": "sportAdminId",
  "e-post": "email",
  mobiltelefon: "phoneMobile",
  "telefon hem": "phoneHome",
  "telefon jobb": "phoneWork",
};

/** SportAdmin's own bookkeeping, of no use once the row is imported. */
const IGNORED_HEADERS = new Set(["skapad", "uppdaterad"]);

/** The three columns that follow a `Målsman N` header and repeat per guardian. */
const CONTACT_HEADERS: Record<string, ContactField> = {
  relation: "relation",
  "e-post": "email",
  telefon: "phone",
};

/**
 * Custom fields that stay off unless asked for. Addresses and `Kön` are data
 * minimisation; `Allergi` is health data and also marked sensitive.
 */
const DEFAULT_OFF = new Set([
  "c/o",
  "adress",
  "postnummer",
  "stad",
  "land",
  "kön",
  "allergi",
]);

const SENSITIVE = new Set(["allergi"]);

function key(header: string): string {
  return header.trim().toLocaleLowerCase("sv");
}

function cell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text =
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Works out what each column is, left to right. A `Målsman N` header opens a
 * guardian block; the `Relation`/`E-post`/`Telefon` that follow belong to it,
 * and anything else closes it. That is what keeps the member's `E-post` from
 * being confused with a parent's.
 */
export function planColumns(
  header: unknown[],
  rows: unknown[][] = [],
): ColumnPlan[] {
  const plans: ColumnPlan[] = [];
  let contactIndex = 0;

  header.forEach((raw, index) => {
    const text = cell(raw) ?? "";
    const name = key(text);
    const guardian = /^målsman\s*(\d+)$/.exec(name);

    let target: ColumnTarget;
    if (guardian) {
      contactIndex = Number(guardian[1]);
      target = { kind: "contact", index: contactIndex, field: "name" };
    } else if (contactIndex > 0 && name in CONTACT_HEADERS) {
      target = {
        kind: "contact",
        index: contactIndex,
        field: CONTACT_HEADERS[name] as ContactField,
      };
    } else if (name in BUILTIN_HEADERS) {
      contactIndex = 0;
      target = {
        kind: "builtin",
        field: BUILTIN_HEADERS[name] as BuiltinField,
      };
    } else if (name === "" || IGNORED_HEADERS.has(name)) {
      contactIndex = 0;
      target = { kind: "skip" };
    } else {
      contactIndex = 0;
      target = { kind: "custom", name: text };
    }

    const empty =
      rows.length > 0 && rows.every((row) => cell(row[index]) === null);

    plans.push({
      index,
      header: text,
      target,
      enabled:
        target.kind !== "skip" &&
        !(target.kind === "custom" && DEFAULT_OFF.has(name)),
      sensitive: SENSITIVE.has(name),
      empty,
    });
  });

  return plans;
}

/** A mobile is what a coach rings first; the others are fallbacks. */
function pickPhone(
  values: Partial<Record<BuiltinField, string | null>>,
): string | null {
  return values.phoneMobile ?? values.phoneHome ?? values.phoneWork ?? null;
}

export interface ParsedSheet {
  plans: ColumnPlan[];
  /** Data rows, header excluded. */
  rows: unknown[][];
  /** Distinct `Grupp` values — several means the file spans teams. */
  teamNames: string[];
  /**
   * How many column headers are dates. An attendance matrix (#86) has one per
   * activity, and this import would happily turn each into a custom field —
   * which is how a real file of 55 trainings once became 54 custom fields and
   * 36 duplicate members. See `looksLikeAttendance`.
   */
  dateColumns: number;
}

/**
 * A header that is a date, with or without the attendance sheet's pipe
 * fields: `2026-03-24`, `2026-03-24 | 17:00 | Träning`.
 */
function isDateHeader(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(\s*\|.*)?$/.test(text.trim());
}

/**
 * A roster export has no date columns at all. Two or more says this is the
 * attendance matrix, and importing it here would create people and fields
 * nobody asked for instead of filling the calendar.
 */
export function looksLikeAttendance(sheet: ParsedSheet): boolean {
  return sheet.dateColumns >= 2;
}

/** Splits a sheet into a column plan and its data rows. */
export function parseSheet(sheet: unknown[][]): ParsedSheet {
  const [header = [], ...rows] = sheet;
  const plans = planColumns(header, rows);

  const teamColumn = plans.find(
    (plan) =>
      plan.target.kind === "builtin" && plan.target.field === "teamName",
  );
  const teamNames =
    teamColumn === undefined
      ? []
      : [
          ...new Set(
            rows
              .map((row) => cell(row[teamColumn.index]))
              .filter((value): value is string => value !== null),
          ),
        ];

  return {
    plans,
    rows,
    teamNames,
    dateColumns: plans.filter((plan) => isDateHeader(plan.header)).length,
  };
}

/**
 * Turns one sheet row into what the API accepts, honouring the plan's
 * enabled/skip choices. Returns null for a row with no name — trailing blank
 * rows are normal in an export and are not worth an error.
 */
export function toImportRow(
  row: unknown[],
  plans: ColumnPlan[],
  rowNumber: number,
): ImportRow | null {
  const builtins: Partial<Record<BuiltinField, string | null>> = {};
  const customFields: Record<string, string> = {};
  const groups: string[] = [];
  const contactDrafts = new Map<number, Partial<ImportContact>>();

  for (const plan of plans) {
    if (!plan.enabled) continue;
    const value = cell(row[plan.index]);
    if (value === null) continue;

    switch (plan.target.kind) {
      case "builtin":
        if (plan.target.field === "group") {
          groups.push(value);
        } else {
          builtins[plan.target.field] = value;
        }
        break;
      case "custom":
        customFields[plan.target.name] = value;
        break;
      case "contact": {
        const draft = contactDrafts.get(plan.target.index) ?? {};
        draft[plan.target.field] = value;
        contactDrafts.set(plan.target.index, draft);
        break;
      }
      case "skip":
        break;
    }
  }

  const firstName = builtins.firstName ?? null;
  const lastName = builtins.lastName ?? null;
  if (firstName === null && lastName === null) return null;

  // A guardian with no name is an empty Målsman block, not a person.
  const contacts: ImportContact[] = [...contactDrafts.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, draft]) =>
      draft.name
        ? [
            {
              name: draft.name,
              relation: draft.relation ?? null,
              email: draft.email ?? null,
              phone: draft.phone ?? null,
            },
          ]
        : [],
    );

  return {
    rowNumber,
    firstName: firstName ?? "",
    lastName: lastName ?? "",
    personalId: builtins.personalId ?? null,
    externalRef: builtins.externalRef ?? null,
    sportAdminId: builtins.sportAdminId ?? null,
    email: builtins.email ?? null,
    phone: pickPhone(builtins),
    groups,
    customFields,
    contacts,
  };
}

/** Every importable row of a sheet, numbered as the file numbers them. */
export function toImportRows(
  sheet: ParsedSheet,
  plans: ColumnPlan[],
): ImportRow[] {
  return sheet.rows.flatMap((row, offset) => {
    // +2: one for the header, one because spreadsheets count from 1.
    const parsed = toImportRow(row, plans, offset + 2);
    return parsed ? [parsed] : [];
  });
}
