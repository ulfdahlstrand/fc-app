/**
 * What a squad proposal is made from: each player's level, training
 * attendance and matches played (ADR-028). The proposal itself is
 * `suggestSquad`, run on the screen so it follows the mix as it is edited.
 */
import { ORPCError } from "@orpc/server";
import { subDays } from "date-fns";
import type { Kysely } from "kysely";
import type { CallupCandidate } from "@fc-app/contracts";
import { rateOf } from "../attendance/summarise.js";
import { getDb } from "../db/client.js";
import type { Database } from "../db/types.js";
import { os, requireUser } from "../orpc.js";
import { requireTeamPermission } from "../tenancy/membership.js";
import { presentStatusIds } from "./attendance-stats.js";
import { loadTemplate } from "./callup-templates.js";

/** How far back to look when no season covers the match. */
const FALLBACK_DAYS = 90;

/**
 * The window to count over: from the start of the season the match falls in
 * up to the match itself. Seasons may overlap (ADR-008); the one that started
 * most recently is the one the team is thinking of.
 */
async function countingPeriod(
  db: Kysely<Database>,
  teamId: string,
  startsAt: Date
): Promise<{ from: Date; to: Date; seasonName: string | null }> {
  const day = startsAt.toISOString().slice(0, 10);
  const season = await db
    .selectFrom("seasons")
    .select(["name", "starts_on"])
    .where("team_id", "=", teamId)
    .where("starts_on", "<=", day)
    .where("ends_on", ">=", day)
    .orderBy("starts_on", "desc")
    .executeTakeFirst();
  if (season) {
    return {
      from: new Date(`${season.starts_on}T00:00:00Z`),
      to: startsAt,
      seasonName: season.name,
    };
  }
  return { from: subDays(startsAt, FALLBACK_DAYS), to: startsAt, seasonName: null };
}

/** Latest value per member on one metric — a level is its newest assessment. */
async function latestLevels(
  db: Kysely<Database>,
  metricId: string,
  memberIds: string[]
): Promise<Map<string, number>> {
  if (memberIds.length === 0) return new Map();
  const rows = await db
    .selectFrom("development_values")
    .innerJoin(
      "development_assessments",
      "development_assessments.id",
      "development_values.assessment_id"
    )
    .select([
      "development_assessments.member_id as member_id",
      "development_values.value_number as value",
    ])
    .where("development_values.metric_id", "=", metricId)
    .where("development_assessments.member_id", "in", memberIds)
    .where("development_values.value_number", "is not", null)
    .orderBy("development_assessments.assessed_on", "desc")
    .execute();

  const levels = new Map<string, number>();
  for (const row of rows) {
    if (row.value !== null && !levels.has(row.member_id)) {
      levels.set(row.member_id, Number(row.value));
    }
  }
  return levels;
}

/**
 * The coaches among each member's guardians. A coach is whoever may pick this
 * team's squad — a membership reaching the team (scoped to it, or club-wide)
 * whose role grants `callups.manage` — so a custom role that coaches counts
 * too, and no role name is assumed.
 */
async function coachGuardians(
  db: Kysely<Database>,
  teamId: string,
  memberIds: string[]
): Promise<Map<string, string[]>> {
  if (memberIds.length === 0) return new Map();
  const rows = await db
    .selectFrom("member_guardians")
    .innerJoin("users", "users.id", "member_guardians.user_id")
    .innerJoin("members", "members.id", "member_guardians.member_id")
    .innerJoin("teams", "teams.id", "members.team_id")
    .select(["member_guardians.member_id as member_id", "users.name as name"])
    .where("member_guardians.member_id", "in", memberIds)
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("memberships")
          .innerJoin(
            "role_permissions",
            "role_permissions.role_id",
            "memberships.role_id"
          )
          .select("memberships.id")
          .whereRef("memberships.user_id", "=", "member_guardians.user_id")
          .whereRef("memberships.club_id", "=", "teams.club_id")
          .where((inner) =>
            inner.or([
              inner("memberships.team_id", "=", teamId),
              inner("memberships.team_id", "is", null),
            ])
          )
          .where("role_permissions.permission", "=", "callups.manage")
      )
    )
    .orderBy("users.name")
    .execute();

  const byMember = new Map<string, string[]>();
  for (const row of rows) {
    const names = byMember.get(row.member_id) ?? [];
    if (!names.includes(row.name)) names.push(row.name);
    byMember.set(row.member_id, names);
  }
  return byMember;
}

export const callupCandidatesHandler = os.callupCandidates.handler(
  async ({ input, context }) => {
    const user = requireUser(context);
    const db = getDb();
    // Picking the squad is the question, so its gate answers it — not
    // development.manage. Only the level number leaves here, never an
    // assessment's note (ADR-011).
    await requireTeamPermission(db, user.id, input.teamId, "callups.manage");

    const activity = await db
      .selectFrom("activities")
      .select(["id", "starts_at"])
      .where("id", "=", input.activityId)
      .where("team_id", "=", input.teamId)
      .executeTakeFirst();
    if (!activity) {
      throw new ORPCError("NOT_FOUND", { message: "Activity not found" });
    }

    const template = await loadTemplate(db, input.teamId, input.templateId);
    const metric = await db
      .selectFrom("development_metrics")
      .select(["id", "name", "scale_min", "scale_max", "scale_labels"])
      .where("id", "=", template.level_metric_id)
      .executeTakeFirstOrThrow();

    const period = await countingPeriod(db, input.teamId, activity.starts_at);

    const members = await db
      .selectFrom("members")
      .select(["id", "first_name", "last_name"])
      .where("team_id", "=", input.teamId)
      .where("archived", "=", false)
      .execute();
    const memberIds = members.map((member) => member.id);

    const inPeriod = db
      .selectFrom("activities")
      .innerJoin("activity_types", "activity_types.id", "activities.activity_type_id")
      .where("activities.team_id", "=", input.teamId)
      .where("activities.cancelled", "=", false)
      .where("activities.starts_at", ">=", period.from)
      .where("activities.starts_at", "<", period.to)
      .where("activities.id", "!=", activity.id);

    const trainingQuery =
      template.attendance_activity_type_id === null
        ? inPeriod.where("activity_types.supports_call_ups", "=", false)
        : inPeriod.where(
            "activities.activity_type_id",
            "=",
            template.attendance_activity_type_id
          );

    const [levels, trainings, matches, present, coaches] = await Promise.all([
      latestLevels(db, metric.id, memberIds),
      trainingQuery.select("activities.id as id").execute(),
      inPeriod
        .leftJoin("callups", "callups.activity_id", "activities.id")
        .where("activity_types.supports_call_ups", "=", true)
        .select(["activities.id as id", "callups.template_id as template_id"])
        .execute(),
      presentStatusIds(db, input.teamId),
      coachGuardians(db, input.teamId, memberIds),
    ]);

    const trainingIds = new Set(trainings.map((row) => row.id));
    const atThisLevel = new Set(
      matches.filter((row) => row.template_id === template.id).map((row) => row.id)
    );
    const activityIds = [...trainingIds, ...matches.map((row) => row.id)];

    const records =
      activityIds.length === 0 || memberIds.length === 0
        ? []
        : await db
            .selectFrom("attendance_records")
            .select(["member_id", "activity_id", "status_id"])
            .where("activity_id", "in", activityIds)
            .where("member_id", "in", memberIds)
            .execute();

    const tally = new Map(
      memberIds.map((id) => [
        id,
        { attended: 0, marked: 0, matchesPlayed: 0, matchesAtThisLevel: 0 },
      ])
    );
    for (const record of records) {
      const row = tally.get(record.member_id);
      if (row === undefined) continue;
      const wasThere = present.has(record.status_id);
      if (trainingIds.has(record.activity_id)) {
        row.marked += 1;
        if (wasThere) row.attended += 1;
      } else if (wasThere) {
        // A match counts as played only when the player was there.
        row.matchesPlayed += 1;
        if (atThisLevel.has(record.activity_id)) row.matchesAtThisLevel += 1;
      }
    }

    const candidates: CallupCandidate[] = members.map((member) => {
      const row = tally.get(member.id) ?? {
        attended: 0,
        marked: 0,
        matchesPlayed: 0,
        matchesAtThisLevel: 0,
      };
      return {
        memberId: member.id,
        firstName: member.first_name,
        lastName: member.last_name,
        level: levels.get(member.id) ?? null,
        attended: row.attended,
        marked: row.marked,
        attendanceRate: rateOf(row.attended, row.marked),
        matchesPlayed: row.matchesPlayed,
        matchesAtThisLevel: row.matchesAtThisLevel,
        coachNames: coaches.get(member.id) ?? [],
      };
    });

    return {
      scale: {
        metricId: metric.id,
        name: metric.name,
        scaleMin: metric.scale_min ?? 0,
        scaleMax: metric.scale_max ?? 0,
        scaleLabels: metric.scale_labels,
      },
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        seasonName: period.seasonName,
      },
      candidates,
    };
  }
);
