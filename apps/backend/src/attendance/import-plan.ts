/**
 * Deciding what an attendance import would do (#84, #85).
 *
 * One planner, two consumers: the preview returns this untouched and the
 * commit executes it. Keeping the decision in a single place is what makes
 * "importing the same file twice changes nothing" a property of the code
 * rather than a coincidence between two implementations.
 *
 * Nothing here writes.
 */
import type { Kysely } from "kysely";
import {
  normaliseForMatch,
  normaliseName,
  type AttendanceActivityResult,
  type AttendanceImportError,
  type AttendanceRowResult,
  type ImportActivity,
  type ImportAttendanceRow,
  type previewAttendanceImportInputSchema,
} from "@fc-app/contracts";
import type { z } from "zod";
import { toInstant } from "../activities/recurrence.js";
import {
  loadMemberExternalIds,
  SOURCE_SPORTADMIN,
} from "../members/external-ids.js";
import type { Database } from "../db/types.js";

type Input = z.infer<typeof previewAttendanceImportInputSchema>;

/** One activity column, resolved against the team. */
export interface PlannedActivity {
  index: number;
  source: ImportActivity;
  startsAt: Date;
  activityTypeId: string | null;
  /** The type name to create when `activityTypeId` is null. */
  newTypeName: string | null;
  /** Set when the column matched an activity the team already has. */
  activityId: string | null;
  skip: boolean;
}

/** An external id worth remembering, because this row matched some other way. */
export interface LearnedExternalId {
  memberId: string;
  externalId: string;
}

/** One mark a commit would write. */
export interface PlannedMark {
  activityIndex: number;
  memberId: string;
  statusId: string;
}

export interface AttendancePlan {
  activities: AttendanceActivityResult[];
  rows: AttendanceRowResult[];
  summary: z.infer<
    typeof import("@fc-app/contracts").attendanceImportSummarySchema
  >;
  newActivityTypes: string[];
  /** What the commit acts on. Errored and skipped columns never appear here. */
  planned: PlannedActivity[];
  marks: PlannedMark[];
  /**
   * Rows that matched by name and carry an id the club does not know yet.
   * Recording them is what makes the *next* import exact.
   */
  learn: LearnedExternalId[];
}

interface Snapshot {
  /** Normalised "first last" → member ids. More than one means ambiguous. */
  membersByName: Map<string, string[]>;
  /** SportAdmin's member id → the member of this team who is that person. */
  membersByExternalId: Map<string, string>;
  memberNames: Map<string, string>;
  /** Normalised type name → id, for types the team already has. */
  typesByName: Map<string, string>;
  typeIds: Set<string>;
  statusIds: Set<string>;
  /** Statuses whose mark means the member was there. */
  presentStatusIds: Set<string>;
  /** external_ref → activity id. */
  activitiesByRef: Map<string, string>;
  /** `${typeId}|${instant}` → activity ids, in creation order. */
  activitiesByNaturalKey: Map<string, string[]>;
  /** activity id → member id → status id. */
  records: Map<string, Map<string, string>>;
}

async function loadSnapshot(
  db: Kysely<Database>,
  teamId: string,
  clubId: string
): Promise<Snapshot> {
  const [members, types, statuses, activities] = await Promise.all([
    db
      .selectFrom("members")
      .select(["id", "first_name", "last_name"])
      .where("team_id", "=", teamId)
      .execute(),
    db
      .selectFrom("activity_types")
      .select(["id", "name"])
      .where("team_id", "=", teamId)
      .execute(),
    db
      .selectFrom("attendance_statuses")
      .select(["id", "counts_as_present"])
      .where("team_id", "=", teamId)
      .execute(),
    db
      .selectFrom("activities")
      .select(["id", "external_ref", "activity_type_id", "starts_at"])
      .where("team_id", "=", teamId)
      .orderBy("starts_at")
      .execute(),
  ]);

  const membersByName = new Map<string, string[]>();
  const memberNames = new Map<string, string>();
  for (const m of members) {
    const key = normaliseName(m.first_name, m.last_name);
    membersByName.set(key, [...(membersByName.get(key) ?? []), m.id]);
    memberNames.set(m.id, `${m.first_name} ${m.last_name}`.trim());
  }

  const activitiesByRef = new Map<string, string>();
  const activitiesByNaturalKey = new Map<string, string[]>();
  for (const a of activities) {
    if (a.external_ref) activitiesByRef.set(a.external_ref, a.id);
    const key = `${a.activity_type_id}|${new Date(a.starts_at).toISOString()}`;
    activitiesByNaturalKey.set(key, [
      ...(activitiesByNaturalKey.get(key) ?? []),
      a.id,
    ]);
  }

  const records = new Map<string, Map<string, string>>();
  if (activities.length > 0) {
    const rows = await db
      .selectFrom("attendance_records")
      .select(["activity_id", "member_id", "status_id"])
      .where(
        "activity_id",
        "in",
        activities.map((a) => a.id)
      )
      .execute();
    for (const r of rows) {
      const byMember = records.get(r.activity_id) ?? new Map<string, string>();
      byMember.set(r.member_id, r.status_id);
      records.set(r.activity_id, byMember);
    }
  }

  return {
    membersByName,
    membersByExternalId: await loadMemberExternalIds(db, {
      teamId,
      clubId,
      source: SOURCE_SPORTADMIN,
    }),
    memberNames,
    typesByName: new Map(types.map((t) => [normaliseForMatch(t.name), t.id])),
    typeIds: new Set(types.map((t) => t.id)),
    statusIds: new Set(statuses.map((s) => s.id)),
    presentStatusIds: new Set(
      statuses.filter((s) => s.counts_as_present).map((s) => s.id)
    ),
    activitiesByRef,
    activitiesByNaturalKey,
    records,
  };
}

function err(
  code: AttendanceImportError["code"],
  detail: string | null = null
): AttendanceImportError {
  return { code, detail };
}

/**
 * Resolve the activity columns. An unconfirmed column is skipped rather than
 * errored: the source simply never registered it, which is not a mistake in
 * the file.
 */
function planActivities(
  input: Input,
  snap: Snapshot
): {
  planned: PlannedActivity[];
  results: AttendanceActivityResult[];
  newTypes: string[];
} {
  const typeChoice = new Map(
    input.typeMapping.map((m) => [normaliseForMatch(m.sourceName), m])
  );
  const newTypes: string[] = [];
  const planned: PlannedActivity[] = [];
  const results: AttendanceActivityResult[] = [];
  const seenRefs = new Set<string>();
  // How many columns of the file have already claimed one natural key, so a
  // second match at the same instant takes the second existing activity
  // rather than the first one again.
  const naturalUse = new Map<string, number>();

  input.activities.forEach((source, index) => {
    const errors: AttendanceImportError[] = [];
    let startsAt: Date | null = null;
    try {
      startsAt = toInstant(source.date, source.time, input.timeZone);
    } catch {
      errors.push(err("invalidDateTime", `${source.date} ${source.time}`));
    }

    const choice = typeChoice.get(normaliseForMatch(source.typeName));
    let activityTypeId: string | null = null;
    let newTypeName: string | null = null;
    if (!choice) {
      errors.push(err("unmappedType", source.typeName));
    } else if (choice.activityTypeId === null) {
      newTypeName = choice.sourceName;
      if (!newTypes.includes(choice.sourceName)) newTypes.push(choice.sourceName);
    } else if (!snap.typeIds.has(choice.activityTypeId)) {
      errors.push(err("unmappedType", source.typeName));
    } else {
      activityTypeId = choice.activityTypeId;
    }

    if (source.externalRef) {
      if (seenRefs.has(source.externalRef)) {
        errors.push(err("duplicateActivity", source.externalRef));
      }
      seenRefs.add(source.externalRef);
    }

    // A type that does not exist yet cannot have matched anything, so a
    // column pointing at one is always a create.
    let activityId: string | null = null;
    if (errors.length === 0 && startsAt && activityTypeId) {
      if (source.externalRef) {
        activityId = snap.activitiesByRef.get(source.externalRef) ?? null;
      }
      if (!activityId) {
        const key = `${activityTypeId}|${startsAt.toISOString()}`;
        const candidates = snap.activitiesByNaturalKey.get(key) ?? [];
        const used = naturalUse.get(key) ?? 0;
        activityId = candidates[used] ?? null;
        if (activityId) naturalUse.set(key, used + 1);
      }
    }

    const skip = !source.confirmed;
    const outcome = errors.length
      ? ("error" as const)
      : skip
        ? ("skipped" as const)
        : activityId
          ? ("reuse" as const)
          : ("create" as const);

    results.push({
      index,
      date: source.date,
      time: source.time,
      typeName: source.typeName,
      outcome,
      activityId,
      errors,
    });

    if (outcome === "create" || outcome === "reuse") {
      planned.push({
        index,
        source,
        startsAt: startsAt as Date,
        activityTypeId,
        newTypeName,
        activityId,
        skip: false,
      });
    }
  });

  return { planned, results, newTypes };
}

export async function buildAttendancePlan(
  db: Kysely<Database>,
  input: Input,
  clubId: string
): Promise<AttendancePlan> {
  const snap = await loadSnapshot(db, input.teamId, clubId);
  const { planned, results, newTypes } = planActivities(input, snap);

  const statusOf = new Map(
    input.statusMapping
      .filter((m) => m.statusId !== null && snap.statusIds.has(m.statusId))
      .map((m) => [m.value, m.statusId as string])
  );
  const known = new Set(input.statusMapping.map((m) => m.value));

  // Columns in the order they happened, so "before this member's first mark"
  // means what it says. The file's own order is not trusted for this.
  const chronological = [...planned].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.index - b.index
  );

  const rows: AttendanceRowResult[] = [];
  const marks: PlannedMark[] = [];
  const learn: LearnedExternalId[] = [];
  let marksAdded = 0;
  let marksChanged = 0;
  let marksUnchanged = 0;
  let errorCount = 0;

  for (const row of input.rows) {
    const errors: AttendanceImportError[] = [];
    const name = `${row.firstName} ${row.lastName}`.trim();

    // The source's own id first, because it survives what names do not: a
    // spelling, a marriage, a truncation in the export. A name match is the
    // fallback that teaches the club the id (#89), so the second import of a
    // team is exact and the third cannot duplicate anybody.
    const byId = row.externalRef
      ? (snap.membersByExternalId.get(row.externalRef) ?? null)
      : null;

    let memberId = byId;
    let matchedBy: AttendanceRowResult["matchedBy"] = byId ? "externalId" : null;

    if (!memberId) {
      const candidates =
        snap.membersByName.get(normaliseName(row.firstName, row.lastName)) ?? [];
      if (candidates.length === 0) errors.push(err("memberNotFound", name));
      if (candidates.length > 1) errors.push(err("ambiguousMember", name));
      if (candidates.length === 1) {
        memberId = candidates[0] ?? null;
        matchedBy = "name";
        if (memberId && row.externalRef) {
          learn.push({ memberId, externalId: row.externalRef });
        }
      }
    }

    for (const value of Object.values(row.marks)) {
      if (!known.has(value)) {
        errors.push(err("unmappedValue", value));
        break;
      }
    }

    if (errors.length > 0 || !memberId) {
      errorCount += 1;
      rows.push({
        rowNumber: row.rowNumber,
        name,
        memberId,
        matchedBy,
        added: 0,
        changed: 0,
        unchanged: 0,
        beforeJoining: 0,
        changes: [],
        errors,
      });
      continue;
    }

    // A member who joined in August is not absent from the spring — they were
    // not there to be counted. Their history starts at their first mark that
    // means "was here"; everything before it is unmarked. This trades away
    // the absences of someone who genuinely missed the whole start of the
    // season, which is the rarer case by far.
    const firstPresent = chronological.findIndex((a) => {
      const statusId = statusOf.get(row.marks[String(a.index)] ?? "");
      return statusId !== undefined && snap.presentStatusIds.has(statusId);
    });

    let added = 0;
    let changed = 0;
    let unchanged = 0;
    let beforeJoining = 0;
    const changes: AttendanceRowResult["changes"] = [];

    chronological.forEach((activity, position) => {
      const value = row.marks[String(activity.index)];
      if (value === undefined) return;
      const statusId = statusOf.get(value);
      if (statusId === undefined) return; // mapped to "ignore"

      if (firstPresent >= 0 && position < firstPresent) {
        beforeJoining += 1;
        return;
      }
      if (firstPresent < 0) {
        // Nothing this member did counts as being there, so there is no point
        // at which their history starts. Writing a season of absences for
        // someone who may never have been in the team would be inventing it.
        beforeJoining += 1;
        return;
      }

      const existing = activity.activityId
        ? snap.records.get(activity.activityId)?.get(memberId)
        : undefined;
      if (existing === statusId) {
        unchanged += 1;
        return;
      }
      if (existing === undefined) added += 1;
      else {
        changed += 1;
        changes.push({
          activityIndex: activity.index,
          from: existing ?? null,
          to: statusId,
        });
      }
      marks.push({ activityIndex: activity.index, memberId, statusId });
    });

    marksAdded += added;
    marksChanged += changed;
    marksUnchanged += unchanged;
    rows.push({
      rowNumber: row.rowNumber,
      name,
      memberId,
      matchedBy,
      added,
      changed,
      unchanged,
      beforeJoining,
      changes,
      errors,
    });
  }

  return {
    activities: results,
    rows,
    summary: {
      activitiesCreated: results.filter((a) => a.outcome === "create").length,
      activitiesReused: results.filter((a) => a.outcome === "reuse").length,
      activitiesSkipped: results.filter((a) => a.outcome === "skipped").length,
      marksAdded,
      marksChanged,
      marksUnchanged,
      errors:
        errorCount + results.filter((a) => a.outcome === "error").length,
    },
    newActivityTypes: newTypes,
    planned,
    marks,
    learn,
  };
}
