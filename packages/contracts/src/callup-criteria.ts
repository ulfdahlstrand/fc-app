/**
 * Call-up criteria: the level a match is booked at, the mix of player levels it
 * wants, and the rule that proposes a squad from them (ADR-028).
 *
 * A **match level** ("Lätt match") is team configuration (ADR-005): which
 * development metric holds a player's level, how much training attendance a
 * player needs, and a list of **slots** — "6 × Lätt", "2 × Medel". A slot names
 * the scale steps allowed to fill it outright, so a borderline player is just a
 * step the team added to its scale ("Lätt/Medel") and listed in both slots. No
 * label is ever parsed.
 *
 * The proposal is a draft like any squad (ADR-013): `suggestSquad` only picks,
 * and the coach saves. It is pure and shared so the screen can re-run it the
 * moment a coach edits the mix, and so the rule has one home (ADR-010).
 */

import { z } from "zod";
import { AT_RISK_MIN_MARKED } from "./attendance.js";
import { isoInstantSchema, queryBooleanSchema } from "./common.js";

/** Largest squad a single slot may ask for — far above any real match. */
export const MAX_SLOT_COUNT = 50;

/** Most slots a mix may have; a scale spans at most 21 steps anyway. */
export const MAX_SLOTS = 20;

export const callupSlotSchema = z.object({
  count: z.number().int().min(1).max(MAX_SLOT_COUNT),
  /** The scale values allowed to fill this slot. Never empty. */
  levels: z.array(z.number().int()).min(1).max(50),
});

export type CallupSlot = z.infer<typeof callupSlotSchema>;

export const callupSlotsSchema = z.array(callupSlotSchema).max(MAX_SLOTS);

/** Training attendance as a whole percent, the same unit as `rateOf`. */
const attendanceRateSchema = z.number().int().min(0).max(100);

/**
 * Coach children a match must include — a match can only be coached if a
 * coach is there, and a coach comes with their child. Zero for none.
 */
export const MAX_COACH_CHILDREN = 10;
const coachChildrenSchema = z.number().int().min(0).max(MAX_COACH_CHILDREN);

export const callupTemplateSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string(),
  /** The `scale` development metric that holds each player's level. */
  levelMetricId: z.string(),
  /** Least training attendance to be proposed; null for no threshold. */
  minAttendanceRate: attendanceRateSchema.nullable(),
  /**
   * Which activity type counts as training. Null means every type that does
   * not take call-ups — the seeded Training, and whatever else a team runs.
   */
  attendanceActivityTypeId: z.string().nullable(),
  slots: callupSlotsSchema,
  minCoachChildren: coachChildrenSchema,
  sortOrder: z.number().int(),
  archived: z.boolean(),
});

export type CallupTemplate = z.infer<typeof callupTemplateSchema>;

/** What one call-up was set up with — copied from a template, then its own. */
export const callupCriteriaSchema = z.object({
  /** The match level; null once that template is gone or when none was chosen. */
  templateId: z.string().nullable(),
  minAttendanceRate: attendanceRateSchema.nullable(),
  slots: callupSlotsSchema,
  minCoachChildren: coachChildrenSchema,
});

export type CallupCriteria = z.infer<typeof callupCriteriaSchema>;

// Templates

export const listCallupTemplatesInputSchema = z.object({
  teamId: z.string(),
  includeArchived: queryBooleanSchema.optional(),
});

export const listCallupTemplatesOutputSchema = z.object({
  templates: z.array(callupTemplateSchema),
});

export const createCallupTemplateInputSchema = z.object({
  teamId: z.string(),
  name: z.string().trim().min(1).max(100),
  levelMetricId: z.string(),
  minAttendanceRate: attendanceRateSchema.nullable().optional(),
  attendanceActivityTypeId: z.string().nullable().optional(),
  slots: callupSlotsSchema,
  minCoachChildren: coachChildrenSchema.optional(),
});

export const createCallupTemplateOutputSchema = z.object({
  template: callupTemplateSchema,
});

export const updateCallupTemplateInputSchema = z.object({
  teamId: z.string(),
  templateId: z.string(),
  name: z.string().trim().min(1).max(100).optional(),
  levelMetricId: z.string().optional(),
  minAttendanceRate: attendanceRateSchema.nullable().optional(),
  attendanceActivityTypeId: z.string().nullable().optional(),
  slots: callupSlotsSchema.optional(),
  minCoachChildren: coachChildrenSchema.optional(),
  sortOrder: z.number().int().optional(),
});

export const updateCallupTemplateOutputSchema = z.object({
  template: callupTemplateSchema,
});

export const archiveCallupTemplateInputSchema = z.object({
  teamId: z.string(),
  templateId: z.string(),
  archived: z.boolean(),
});

export const archiveCallupTemplateOutputSchema = z.object({
  template: callupTemplateSchema,
});

// Candidates

/** The level scale, enough to name a step on screen. */
export const callupLevelScaleSchema = z.object({
  metricId: z.string(),
  name: z.string(),
  scaleMin: z.number().int(),
  scaleMax: z.number().int(),
  scaleLabels: z.array(z.string()),
});

export type CallupLevelScale = z.infer<typeof callupLevelScaleSchema>;

/** One player, as the proposal sees them. */
export const callupCandidateSchema = z.object({
  memberId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  /** Latest assessed level; null when never assessed on this metric. */
  level: z.number().nullable(),
  /** Training attended ÷ marked in the period (ADR-012). */
  attended: z.number().int(),
  marked: z.number().int(),
  attendanceRate: attendanceRateSchema.nullable(),
  /** Matches attended in the period, before this one. */
  matchesPlayed: z.number().int(),
  /** Of those, the ones booked at this match's level. */
  matchesAtThisLevel: z.number().int(),
  /**
   * The coaches among this member's guardians. Non-empty makes them a coach
   * child: picking them brings a coach to the match.
   */
  coachNames: z.array(z.string()),
});

export type CallupCandidate = z.infer<typeof callupCandidateSchema>;

export const callupCandidatesInputSchema = z.object({
  teamId: z.string(),
  activityId: z.string(),
  templateId: z.string(),
});

export const callupCandidatesOutputSchema = z.object({
  scale: callupLevelScaleSchema,
  /** The window attendance and matches are counted over. */
  period: z.object({
    from: isoInstantSchema,
    to: isoInstantSchema,
    /** The season it came from; null when the fallback window was used. */
    seasonName: z.string().nullable(),
  }),
  candidates: z.array(callupCandidateSchema),
});

// Rules

/**
 * Checks a mix against the scale it will be filled from. Kept out of the Zod
 * schema because the bounds belong to a metric the schema cannot see.
 */
export function validateCallupSlots(
  slots: CallupSlot[],
  scale: { scaleMin: number; scaleMax: number }
): { ok: true } | { ok: false; error: string } {
  for (const slot of slots) {
    for (const level of slot.levels) {
      if (level < scale.scaleMin || level > scale.scaleMax) {
        return {
          ok: false,
          error: `Level ${level} is outside the scale ${scale.scaleMin}–${scale.scaleMax}`,
        };
      }
    }
    if (new Set(slot.levels).size !== slot.levels.length) {
      return { ok: false, error: "A slot lists the same level twice" };
    }
  }
  return { ok: true };
}

/** Total players a mix asks for. */
export function slotTotal(slots: CallupSlot[]): number {
  return slots.reduce((sum, slot) => sum + slot.count, 0);
}

/**
 * Whether attendance keeps a player out. Too few marked sessions is "unknown",
 * not "low" — a player new this season is not punished for having no history,
 * the same reasoning as `isAtRisk`.
 */
export function belowAttendance(
  candidate: Pick<CallupCandidate, "attendanceRate" | "marked">,
  minAttendanceRate: number | null
): boolean {
  return (
    minAttendanceRate !== null &&
    candidate.attendanceRate !== null &&
    candidate.marked >= AT_RISK_MIN_MARKED &&
    candidate.attendanceRate < minAttendanceRate
  );
}

export type CallupExclusion = "noLevel" | "lowAttendance";

export interface SquadSuggestion {
  /** Who fills which slot, in slot order. */
  picked: { memberId: string; slotIndex: number }[];
  /** Slots the eligible players could not fill. */
  unfilled: { slotIndex: number; missing: number }[];
  excluded: { memberId: string; reason: CallupExclusion }[];
  /** Coach children still missing — the match may have no-one to coach it. */
  coachChildrenMissing: number;
}

/** Whether picking this player brings a coach along. */
export function isCoachChild(candidate: Pick<CallupCandidate, "coachNames">): boolean {
  return candidate.coachNames.length > 0;
}

/**
 * Rotation first: fewest matches played, then fewest at this match's level —
 * which is what moves a borderline player between levels over a season —
 * then the better trainer, then the name so the result never flickers.
 */
function compareForRotation(a: CallupCandidate, b: CallupCandidate): number {
  return (
    a.matchesPlayed - b.matchesPlayed ||
    a.matchesAtThisLevel - b.matchesAtThisLevel ||
    (b.attendanceRate ?? -1) - (a.attendanceRate ?? -1) ||
    a.firstName.localeCompare(b.firstName, "sv") ||
    a.lastName.localeCompare(b.lastName, "sv") ||
    a.memberId.localeCompare(b.memberId)
  );
}

/**
 * Fills the slots from the candidates.
 *
 * The tightest slot goes first — the one with the least slack between the
 * players who could fill it and the players it wants. Filling in listed order
 * instead would let a wide "Lätt" slot take the Lätt/Medel players a narrow
 * "Medel" slot had no-one else for.
 */
export function suggestSquad(
  candidates: CallupCandidate[],
  slots: CallupSlot[],
  minAttendanceRate: number | null,
  minCoachChildren = 0
): SquadSuggestion {
  const excluded: SquadSuggestion["excluded"] = [];
  const eligible: CallupCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.level === null) {
      excluded.push({ memberId: candidate.memberId, reason: "noLevel" });
    } else if (belowAttendance(candidate, minAttendanceRate)) {
      excluded.push({ memberId: candidate.memberId, reason: "lowAttendance" });
    } else {
      eligible.push(candidate);
    }
  }

  const fits = (candidate: CallupCandidate, slot: CallupSlot) =>
    candidate.level !== null && slot.levels.includes(candidate.level);

  const order = slots
    .map((slot, index) => ({
      index,
      slack: eligible.filter((c) => fits(c, slot)).length - slot.count,
    }))
    .sort((a, b) => a.slack - b.slack || a.index - b.index);

  const taken = new Set<string>();
  const placed: { candidate: CallupCandidate; slotIndex: number }[] = [];
  const unfilled: SquadSuggestion["unfilled"] = [];

  for (const { index } of order) {
    const slot = slots[index];
    if (slot === undefined) continue;
    const chosen = eligible
      .filter((c) => !taken.has(c.memberId) && fits(c, slot))
      .sort(compareForRotation)
      .slice(0, slot.count);
    for (const candidate of chosen) {
      taken.add(candidate.memberId);
      placed.push({ candidate, slotIndex: index });
    }
    if (chosen.length < slot.count) {
      unfilled.push({ slotIndex: index, missing: slot.count - chosen.length });
    }
  }

  // Coach children: without one the match cannot be coached. Rotation usually
  // brings one along anyway, and then nothing changes. Only when it does not is
  // one brought in — the one closest to being picked on their own merits, in
  // place of the player with the weakest claim to that slot (or into a place
  // nobody could fill). Choosing the coach child who had simply played least
  // instead would keep pulling in the one at the level with fewest places.
  let coachChildrenMissing = Math.max(
    0,
    minCoachChildren - placed.filter((p) => isCoachChild(p.candidate)).length
  );
  while (coachChildrenMissing > 0) {
    let best:
      | { child: CallupCandidate; slotIndex: number; out: number | null; cost: number }
      | undefined;
    for (const child of eligible) {
      if (taken.has(child.memberId) || !isCoachChild(child)) continue;
      slots.forEach((slot, slotIndex) => {
        if (!fits(child, slot)) return;
        const open = unfilled.find((u) => u.slotIndex === slotIndex && u.missing > 0);
        let out: number | null = null;
        let cost = Number.NEGATIVE_INFINITY;
        if (open === undefined) {
          // The last in by rotation is the one with the weakest claim.
          let weakest: number | null = null;
          placed.forEach((p, i) => {
            if (p.slotIndex !== slotIndex || isCoachChild(p.candidate)) return;
            if (weakest === null || compareForRotation(p.candidate, placed[weakest]!.candidate) > 0) {
              weakest = i;
            }
          });
          if (weakest === null) return;
          out = weakest;
          cost = child.matchesPlayed - placed[weakest]!.candidate.matchesPlayed;
        }
        if (
          best === undefined ||
          cost < best.cost ||
          (cost === best.cost && compareForRotation(child, best.child) < 0)
        ) {
          best = { child, slotIndex, out, cost };
        }
      });
    }
    if (best === undefined) break;
    if (best.out === null) {
      const open = unfilled.find((u) => u.slotIndex === best!.slotIndex)!;
      open.missing -= 1;
    } else {
      taken.delete(placed[best.out]!.candidate.memberId);
      placed.splice(best.out, 1);
    }
    taken.add(best.child.memberId);
    placed.push({ candidate: best.child, slotIndex: best.slotIndex });
    coachChildrenMissing -= 1;
  }

  const picked = placed
    .map((p) => ({ memberId: p.candidate.memberId, slotIndex: p.slotIndex }))
    .sort((a, b) => a.slotIndex - b.slotIndex);
  return {
    picked,
    unfilled: unfilled
      .filter((u) => u.missing > 0)
      .sort((a, b) => a.slotIndex - b.slotIndex),
    excluded,
    coachChildrenMissing,
  };
}

/**
 * How full each slot is with the squad a coach has actually picked — the
 * "Lätt 5/6" on screen. The same placement as a proposal, without the
 * attendance threshold: a player the coach chose by hand still counts.
 */
export function slotFill(
  squad: CallupCandidate[],
  slots: CallupSlot[]
): { filled: number[]; unplaced: string[] } {
  const { picked } = suggestSquad(squad, slots, null);
  const filled = slots.map(
    (_, index) => picked.filter((one) => one.slotIndex === index).length
  );
  const placed = new Set(picked.map((one) => one.memberId));
  return {
    filled,
    unplaced: squad.filter((c) => !placed.has(c.memberId)).map((c) => c.memberId),
  };
}
