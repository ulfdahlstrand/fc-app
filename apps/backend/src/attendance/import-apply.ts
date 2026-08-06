/**
 * Carrying out an attendance import plan (#85).
 *
 * Everything here runs inside the caller's transaction and acts only on
 * `plan.planned` and `plan.marks` — which exclude errored rows, unconfirmed
 * columns, and every mark that already says what the file says. So a bad row
 * costs its own line, and re-importing an unchanged season writes nothing at
 * all.
 *
 * Nothing is ever cleared. A cell the source left blank means "nobody said",
 * not "delete what you know" (ADR-014's reading of absence) — removing a
 * wrong mark is done on the activity.
 */
import type { Kysely } from "kysely";
import { normaliseForMatch } from "@fc-app/contracts";
import type { previewAttendanceImportInputSchema } from "@fc-app/contracts";
import type { z } from "zod";
import type { Database } from "../db/types.js";
import {
  recordMemberExternalId,
  SOURCE_SPORTADMIN,
} from "../members/external-ids.js";
import type { AttendancePlan } from "./import-plan.js";

type Input = z.infer<typeof previewAttendanceImportInputSchema>;

/**
 * Activity type names the mapping asked to create. Unlike the roster import's
 * groups, a type cannot be conjured from a name alone — it is a name plus a
 * colour plus whether it takes call-ups — so the colour comes from the
 * mapping step and call-ups stay off, which is the safe default for history.
 */
async function ensureActivityTypes(
  trx: Kysely<Database>,
  teamId: string,
  input: Input,
  plan: AttendancePlan
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  const wanted = plan.planned
    .map((activity) => activity.newTypeName)
    .filter((name): name is string => name !== null);
  if (wanted.length === 0) return byName;

  const existing = await trx
    .selectFrom("activity_types")
    .select(["id", "name"])
    .where("team_id", "=", teamId)
    .execute();
  for (const row of existing) byName.set(normaliseForMatch(row.name), row.id);

  const sortOrder = await trx
    .selectFrom("activity_types")
    .select((eb) => eb.fn.max("sort_order").as("max"))
    .where("team_id", "=", teamId)
    .executeTakeFirst();
  let next = (sortOrder?.max ?? 0) + 1;

  const colourOf = new Map(
    input.typeMapping.map((m) => [normaliseForMatch(m.sourceName), m.colour])
  );

  for (const name of wanted) {
    const key = normaliseForMatch(name);
    if (byName.has(key)) continue;
    const inserted = await trx
      .insertInto("activity_types")
      .values({
        team_id: teamId,
        name,
        colour: colourOf.get(key) ?? "neutral",
        supports_call_ups: false,
        sort_order: next,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    byName.set(key, inserted.id);
    next += 1;
  }
  return byName;
}

/**
 * Column index → the activity it writes to, creating the ones the season
 * introduces. Imported activities are ordinary: no series, not cancelled, and
 * carrying no marker saying where they came from. They happened.
 */
async function ensureActivities(
  trx: Kysely<Database>,
  teamId: string,
  plan: AttendancePlan,
  typeIds: Map<string, string>
): Promise<Map<number, string>> {
  const byIndex = new Map<number, string>();

  for (const activity of plan.planned) {
    if (activity.activityId) {
      byIndex.set(activity.index, activity.activityId);
      continue;
    }
    const activityTypeId =
      activity.activityTypeId ??
      typeIds.get(normaliseForMatch(activity.newTypeName ?? ""));
    if (!activityTypeId) continue;

    const inserted = await trx
      .insertInto("activities")
      .values({
        team_id: teamId,
        activity_type_id: activityTypeId,
        external_ref: activity.source.externalRef,
        title: activity.source.title,
        starts_at: activity.startsAt,
        ends_at: null,
        location: null,
        notes: null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    byIndex.set(activity.index, inserted.id);
  }

  return byIndex;
}

export async function applyAttendancePlan(
  trx: Kysely<Database>,
  teamId: string,
  clubId: string,
  input: Input,
  plan: AttendancePlan
): Promise<void> {
  // Remember what the source calls the people this run matched by name, so
  // the next import of this team matches on an id instead (#89). Done first:
  // it is the part that stops the next import going wrong, and it should not
  // depend on the marks writing cleanly.
  for (const learned of plan.learn) {
    await recordMemberExternalId(trx, {
      memberId: learned.memberId,
      clubId,
      source: SOURCE_SPORTADMIN,
      externalId: learned.externalId,
    });
  }

  const typeIds = await ensureActivityTypes(trx, teamId, input, plan);
  const activityIds = await ensureActivities(trx, teamId, plan, typeIds);
  if (plan.marks.length === 0) return;

  const rows = plan.marks.flatMap((mark) => {
    const activityId = activityIds.get(mark.activityIndex);
    if (!activityId) return [];
    return [
      {
        activity_id: activityId,
        member_id: mark.memberId,
        status_id: mark.statusId,
        note: null,
      },
    ];
  });
  if (rows.length === 0) return;

  // A mark that already exists is an update of its status, never a second
  // row: `(activity_id, member_id)` is the primary key, and one person is
  // one thing at one training.
  await trx
    .insertInto("attendance_records")
    .values(rows)
    .onConflict((oc) =>
      oc.columns(["activity_id", "member_id"]).doUpdateSet((eb) => ({
        status_id: eb.ref("excluded.status_id"),
        updated_at: new Date(),
      }))
    )
    .execute();
}
