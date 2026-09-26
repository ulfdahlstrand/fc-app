/**
 * The roster's fill-in mode (#103): which custom fields it shows, and what a
 * single edited cell should do when it is left.
 *
 * Pure on purpose. The view itself is two shells' worth of markup; the rules
 * that decide what is on screen and what reaches the server are here, where
 * they can be read and tested without one.
 */
import {
  validateMemberFieldValue,
  type Member,
  type MemberFieldDefinition,
  type MemberFieldType,
} from "@fc-app/contracts";

/**
 * Per team, because two teams' field sets have nothing to do with each other.
 * Follows `fc-app.selected-team-id` in `lib/clubs.ts`.
 */
const KEY_PREFIX = "fc-app.member-fields.";

export function pickedFieldsKey(teamId: string): string {
  return `${KEY_PREFIX}${teamId}`;
}

/**
 * The ids stored for a team, or **null when nothing is stored** — which is a
 * different thing from an empty list. Nothing stored means "never chosen", and
 * `visibleFields` answers that with every field; an empty list means the user
 * unpicked them all, and that choice is kept.
 *
 * Anything unreadable — private-mode storage, a value from an older shape —
 * is treated as nothing stored rather than thrown at the user.
 */
export function readPickedFieldIds(teamId: string): string[] | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(pickedFieldsKey(teamId));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return null;
  }
}

export function writePickedFieldIds(teamId: string, ids: string[]): void {
  try {
    localStorage.setItem(pickedFieldsKey(teamId), JSON.stringify(ids));
  } catch {
    // A browser that refuses to store this still has a usable view; the
    // choice simply does not survive the reload.
  }
}

/**
 * The fields the view shows, resolved against the live definitions.
 *
 * Stored ids go stale — fields get archived (#8) and teams get deleted — so
 * they are filtered against what `useMemberFields` actually returned rather
 * than trusted. **An id from storage must never reach the server**, which
 * answers an unknown or archived definition with `BAD_REQUEST`.
 *
 * The order is the definitions' own (the server sorts them), never the stored
 * order, so unpicking and repicking a field puts it back where it belongs.
 */
export function visibleFields(
  storedIds: string[] | null,
  fields: readonly MemberFieldDefinition[]
): MemberFieldDefinition[] {
  if (storedIds === null) return [...fields];
  const picked = new Set(storedIds);
  return fields.filter((field) => picked.has(field.id));
}

/**
 * What a field is called wherever its values are shown: its own name, and for
 * a season-bound field the season after it — "Stuvsta häfte" tied to "höst
 * 2026" heads its column "Stuvsta häfte höst 2026", so two seasons' versions
 * of the same question are never two identical headers.
 *
 * The settings list keeps the bare name and shows the season as a badge.
 */
export function fieldLabel(
  field: Pick<MemberFieldDefinition, "name" | "season">
): string {
  return field.season === null
    ? field.name
    : `${field.name} ${field.season.name}`;
}

/**
 * Whether a season-bound field's season is over. `today` is the local date as
 * "YYYY-MM-DD", which compares as a string against the season's last day —
 * and that day itself still counts as the season.
 */
export function seasonEnded(
  field: Pick<MemberFieldDefinition, "season">,
  today: string
): boolean {
  return field.season !== null && field.season.endsOn < today;
}

/**
 * The fields the roster is allowed to show at all.
 *
 * Two decisions stack here and they are not the same one. The **team** says
 * which fields belong in a list (`showInList`); the **user** then picks which
 * of those to actually show, and that pick is what `visibleFields` resolves.
 * So this runs first, and a field turned off for the list cannot be brought
 * back by a stored id — the same way an archived one cannot.
 *
 * A field tied to a season that has ended drops out here too: the column was
 * a question for that season, and it is answered. Its values stay on the
 * member's own page.
 */
export function listFields(
  fields: readonly MemberFieldDefinition[],
  today: string
): MemberFieldDefinition[] {
  return fields.filter(
    (field) => field.showInList && !seasonEnded(field, today)
  );
}

/**
 * The roster's columns, split at the one place the split matters.
 *
 * `presentation` is the team's leading field — drawn *before* the name, and in
 * the circle on a phone — and `rest` is everything the team put in the list
 * behind it. One helper rather than two filters at each call site, because a
 * header row and a body row that disagree about which columns exist is the
 * bug this shape exists to prevent (two tables, four loops).
 *
 * The server sorts the presentation field first, so `fields[0]` would usually
 * do; this does not rely on that.
 */
export function rosterColumns(
  fields: readonly MemberFieldDefinition[],
  today: string
): {
  presentation: MemberFieldDefinition | null;
  rest: MemberFieldDefinition[];
} {
  const listed = listFields(fields, today);
  const presentation = listed.find((field) => field.presentation) ?? null;
  return {
    presentation,
    rest: listed.filter((field) => field.id !== presentation?.id),
  };
}

/** How much of a value the phone's circle can hold before it stops reading. */
const CIRCLE_MAX = 3;

/**
 * What the circle on a phone shows.
 *
 * Initials are the default and they say almost nothing — they repeat the name
 * sitting next to them. A jersey number is what a coach actually scans for, so
 * the presentation field's value takes the circle when it fits.
 *
 * When it does not fit — a text field holding "Målvakt" — the initials stay
 * and the value moves to the meta line rather than being cut to three
 * characters, which would be worse than not showing it.
 */
export function presentationCircle(
  value: string | undefined,
  initials: string
): { circle: string; fromField: boolean; meta: string | null } {
  const trimmed = (value ?? "").trim();
  const fallback = { circle: initials, fromField: false, meta: null };
  if (trimmed === "") return fallback;
  if (trimmed.length > CIRCLE_MAX) return { ...fallback, meta: trimmed };
  return { circle: trimmed, fromField: true, meta: null };
}

/**
 * Whether the arrows may move the field at `index` a step in `direction`.
 *
 * The presentation field leads the list because it is the presentation field,
 * not because it was moved there — so it does not move, and nothing moves past
 * it. The toggle in its dialog is the only thing that changes that.
 */
export function canMoveField(
  fields: readonly MemberFieldDefinition[],
  index: number,
  direction: -1 | 1
): boolean {
  const target = index + direction;
  if (index < 0 || index >= fields.length) return false;
  if (target < 0 || target >= fields.length) return false;
  return (
    fields[index]?.presentation !== true &&
    fields[target]?.presentation !== true
  );
}

/**
 * The ids in `fields` with the one at `index` moved a step in `direction`.
 *
 * Returns the ids unchanged when the move is not allowed — off either end, or
 * across the presentation field — so the caller can compare and skip a request
 * that would change nothing.
 */
export function moveField(
  fields: readonly MemberFieldDefinition[],
  index: number,
  direction: -1 | 1
): string[] {
  const ids = fields.map((field) => field.id);
  const target = index + direction;
  if (!canMoveField(fields, index, direction)) return ids;
  const held = ids[index];
  const neighbour = ids[target];
  // The bounds above already rule this out; the guard is what convinces the
  // compiler, which indexes as `string | undefined`.
  if (held === undefined || neighbour === undefined) return ids;
  const moved = [...ids];
  moved[index] = neighbour;
  moved[target] = held;
  return moved;
}

/** How many of these members have a value for the field, and out of how many. */
export function filledCount(
  fieldId: string,
  members: readonly Pick<Member, "customFields">[]
): { done: number; total: number } {
  const done = members.filter((member) => {
    const raw = member.customFields[fieldId];
    return raw !== undefined && raw !== "";
  }).length;
  return { done, total: members.length };
}

/**
 * What leaving a cell should do.
 *
 * `none` covers the blur after no edit — a sweep tabs through cells it has
 * nothing to say about, and each of those is not a write. `save` with a null
 * value clears the field, which is what the server does with a blank
 * (`setMemberFieldValuesHandler`). `invalid` keeps the typed text on screen;
 * the field type is the reason, since the contract's validation failures map
 * one to one onto it.
 */
export type CellCommit =
  | { action: "none" }
  | { action: "save"; value: string | null }
  | { action: "invalid"; fieldType: MemberFieldType };

export function commitFieldValue(
  field: Pick<MemberFieldDefinition, "fieldType" | "options">,
  draft: string,
  saved: string
): CellCommit {
  const trimmed = draft.trim();
  if (trimmed === "") {
    // Blank clears — but only when there was something to clear. A required
    // field is no exception here: the roster is where you sweep, the member
    // page is where completeness is judged.
    return saved === "" ? { action: "none" } : { action: "save", value: null };
  }

  const result = validateMemberFieldValue(field, draft);
  if (!result.ok) return { action: "invalid", fieldType: field.fieldType };
  // Compare the *normalised* value: "7.0" and "7" are the same number, and
  // re-sending one as the other would invalidate the list for nothing.
  if (result.value === saved) return { action: "none" };
  return { action: "save", value: result.value };
}
