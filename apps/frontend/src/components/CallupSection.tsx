/** Call-up — squad selection (issue #16), with match levels (ADR-028). */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  belowAttendance,
  isCoachChild,
  slotFill,
  suggestSquad,
  type Activity,
  type CallupCandidate,
  type CallupCriteria,
  type CallupExclusion,
  type CallupInvitation,
  type CallupLevelScale,
  type CallupResponse,
  type CallupTemplate,
  type Member,
  type SquadSuggestion,
} from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  criteriaEqual,
  criteriaFromTemplate,
  levelName,
  slotLabel,
  useCallupCandidates,
  useCallupTemplates,
} from "@/lib/callup-criteria";
import { useRespondToCallup } from "@/lib/callup-responses";
import {
  countResponses,
  onBehalfTitle,
  RESPONSE_DISC,
  RESPONSE_GLYPH,
  squadChanged,
  useCallup,
  useSetCallupSquad,
  useUpdateCallup,
} from "@/lib/callups";
import { useHasPermission } from "@/lib/clubs";
import { useGroupMembers, useGroups } from "@/lib/groups";
import { formatMemberName, useMembers } from "@/lib/members";

export function CallupSection({
  teamId,
  activity,
}: {
  teamId: string;
  activity: Activity;
}) {
  const { t } = useTranslation();
  const canManage = useHasPermission("callups.manage");

  const members = useMembers(teamId, {});
  const groups = useGroups(teamId);
  const callup = useCallup(teamId, activity.id);
  const saveSquad = useSetCallupSquad(teamId, activity.id);
  const updateCallup = useUpdateCallup(teamId, activity.id);

  /** The squad as saved. */
  const saved = useMemo(
    () => new Set((callup.data?.invitations ?? []).map((one) => one.memberId)),
    [callup.data],
  );
  const responses = useMemo(() => {
    const map = new Map<string, CallupResponse>();
    for (const invitation of callup.data?.invitations ?? []) {
      map.set(invitation.memberId, invitation.response);
    }
    return map;
  }, [callup.data]);
  // The counts follow the squad on screen, so a member added but not yet
  // saved counts as pending rather than as nothing.
  const responseOf = (memberId: string) => responses.get(memberId) ?? "pending";

  /** The squad as the coach is picking it. */
  const [squad, setSquad] = useState<Set<string>>(new Set());
  useEffect(() => setSquad(saved), [saved]);

  /** The match level and mix, as saved and as being edited. */
  const savedCriteria = callup.data?.criteria ?? null;
  const [criteria, setCriteria] = useState<CallupCriteria | null>(null);
  useEffect(() => setCriteria(savedCriteria), [savedCriteria]);
  const [suggestion, setSuggestion] = useState<SquadSuggestion | null>(null);

  const templates = useCallupTemplates(teamId);
  const candidates = useCallupCandidates(
    teamId,
    activity.id,
    criteria?.templateId ?? null,
    canManage,
  );

  if (members.isPending || callup.isPending) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }
  if (members.isError || callup.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("callups.loadError")}</AlertDescription>
      </Alert>
    );
  }

  const roster = members.data.members;
  if (roster.length === 0) {
    return <p className="text-muted-foreground">{t("callups.noMembers")}</p>;
  }

  const published = callup.data.callup?.published ?? false;
  const invitationByMember = new Map(
    (callup.data.invitations ?? []).map((one) => [one.memberId, one]),
  );
  // Counts follow what is on screen, so the number moves with the taps.
  const counts = countResponses(
    [...squad].map((memberId) => ({ response: responseOf(memberId) })),
  );
  const criteriaDirty = !criteriaEqual(criteria, savedCriteria);
  const dirty = squadChanged(squad, saved) || criteriaDirty;

  const scale = candidates.data?.scale ?? null;
  const candidateById = new Map(
    (candidates.data?.candidates ?? []).map((one) => [one.memberId, one]),
  );
  const exclusionOf = (memberId: string): CallupExclusion | null => {
    const candidate = candidateById.get(memberId);
    if (!candidate || !criteria) return null;
    if (candidate.level === null) return "noLevel";
    return belowAttendance(candidate, criteria.minAttendanceRate)
      ? "lowAttendance"
      : null;
  };

  const propose = () => {
    if (!criteria || !candidates.data) return;
    const result = suggestSquad(
      candidates.data.candidates,
      criteria.slots,
      criteria.minAttendanceRate,
      criteria.minCoachChildren,
    );
    setSuggestion(result);
    setSquad(new Set(result.picked.map((one) => one.memberId)));
  };

  const toggle = (memberId: string) =>
    setSquad((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Ink, not green: this is the fixture card, and the squad is not a
          count of who turned up. Green would claim more than it knows. */}
      <div className="bg-ink flex flex-wrap items-end justify-between gap-4 rounded-xl px-5 py-[18px] text-white kit:px-7 kit:py-6">
        <div className="flex flex-col gap-2">
          <p className="kit-overline text-[var(--neutral-500)]">
            {published ? t("callups.published") : t("callups.draft")}
          </p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={published ? "outline" : "brand"}
                size="sm"
                disabled={
                  updateCallup.isPending || callup.data.callup === null || dirty
                }
                onClick={() =>
                  updateCallup.mutate({ published: !published })
                }
                className={published ? "border-white/40 text-white" : ""}
              >
                {published ? t("callups.unpublish") : t("callups.publish")}
              </Button>
            </div>
          )}
          {dirty && canManage && (
            <p className="text-xs font-semibold text-[var(--neutral-500)]">
              {t("callups.saveFirst")}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="font-display text-5xl leading-none">
            {counts.accepted}
            <span className="text-[var(--neutral-600)]">/{counts.squad}</span>
          </span>
          <span className="kit-overline text-[var(--neutral-500)]">
            {t("callups.accepted")}
          </span>
          {/* Kit's capsule meter, always paired with a fraction. */}
          <span
            aria-hidden
            className="mt-1 block h-[7px] w-40 overflow-hidden rounded-full bg-[var(--ink-600)]"
          >
            <span
              className="block h-full bg-[var(--green-400)]"
              style={{
                width: `${counts.squad === 0 ? 0 : (counts.accepted / counts.squad) * 100}%`,
              }}
            />
          </span>
        </div>
      </div>

      {published && counts.declined > 0 && (
        <Alert>
          <AlertDescription>
            {t("callups.declinedHint", { count: counts.declined })}
          </AlertDescription>
        </Alert>
      )}

      {canManage && (
        <CriteriaPanel
          templates={templates.data?.templates ?? []}
          criteria={criteria}
          scale={scale}
          period={candidates.data?.period ?? null}
          loading={candidates.isFetching}
          squad={[...squad].flatMap((id) => {
            const one = candidateById.get(id);
            return one ? [one] : [];
          })}
          suggestion={suggestion}
          onChange={(next) => {
            setCriteria(next);
            setSuggestion(null);
          }}
          onPropose={propose}
        />
      )}

      {canManage && (groups.data?.groups.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="kit-overline">{t("callups.addGroup")}</span>
          {groups.data?.groups.map((group) => (
            <GroupButton
              key={group.id}
              teamId={teamId}
              groupId={group.id}
              name={group.name}
              onAdd={(memberIds) =>
                setSquad((current) => new Set([...current, ...memberIds]))
              }
            />
          ))}
        </div>
      )}

      <div className="grid gap-[11px] kit:grid-cols-2">
        {roster.map((member) => (
          <SquadRow
            key={member.id}
            member={member}
            inSquad={squad.has(member.id)}
            invitation={invitationByMember.get(member.id)}
            canManage={canManage}
            canAnswer={canManage && published && saved.has(member.id)}
            teamId={teamId}
            activityId={activity.id}
            onToggle={() => toggle(member.id)}
            candidate={criteria ? candidateById.get(member.id) : undefined}
            scale={scale}
            exclusion={exclusionOf(member.id)}
            minAttendanceRate={criteria?.minAttendanceRate ?? null}
          />
        ))}
      </div>

      {/* Kit: the save bar never scrolls away. On a phone it also sits on the
          frame — full-bleed to the gutter and flush against the tab bar,
          rather than floating with a player row showing underneath.
          `-bottom-8` is what does that: a sticky offset is measured from the
          scrollport's *padding* edge, so `bottom-0` parks the bar 32px high,
          exactly the page's own bottom padding. */}
      {canManage && (
        <div className="bg-background sticky -bottom-8 -mx-[var(--gutter)] -mb-8 flex flex-wrap items-center justify-between gap-3 px-[var(--gutter)] py-3 pb-8 kit:bottom-0 kit:mx-0 kit:mb-0 kit:px-0 kit:pb-3">
          <p className="text-muted-foreground text-sm">
            {t("callups.selected", {
              count: counts.squad,
              total: roster.length,
            })}
          </p>
          <div className="flex gap-2">
            {dirty && (
              <Button
                variant="outline"
                disabled={saveSquad.isPending}
                onClick={() => {
                  setSquad(saved);
                  setCriteria(savedCriteria);
                  setSuggestion(null);
                }}
              >
                {t("attendance.discard")}
              </Button>
            )}
            <Button
              disabled={!dirty || saveSquad.isPending}
              onClick={() =>
                saveSquad.mutate({
                  memberIds: [...squad],
                  ...(criteriaDirty && { criteria }),
                })
              }
            >
              {t("callups.save", { count: counts.squad })}
            </Button>
          </div>
        </div>
      )}

      {(saveSquad.isError || updateCallup.isError) && (
        <Alert variant="destructive">
          <AlertDescription>
            {saveSquad.error?.message ??
              updateCallup.error?.message ??
              t("callups.saveError")}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/** Adds a whole group to the squad in one tap (#10). */
function GroupButton({
  teamId,
  groupId,
  name,
  onAdd,
}: {
  teamId: string;
  groupId: string;
  name: string;
  onAdd: (memberIds: string[]) => void;
}) {
  const groupMembers = useGroupMembers(teamId, groupId);
  return (
    <button
      type="button"
      disabled={groupMembers.isPending}
      onClick={() => onAdd(groupMembers.data?.memberIds ?? [])}
      className="bg-card hover:bg-secondary rounded-pill px-4 py-2 text-sm font-semibold transition-colors duration-[120ms] ease-standard disabled:opacity-40"
    >
      + {name}
    </button>
  );
}

function SquadRow({
  member,
  inSquad,
  invitation,
  canManage,
  canAnswer,
  teamId,
  activityId,
  onToggle,
  candidate,
  scale,
  exclusion,
  minAttendanceRate,
}: {
  member: Member;
  inSquad: boolean;
  invitation: CallupInvitation | undefined;
  canManage: boolean;
  /** A coach may answer for a member once the squad has been published. */
  canAnswer: boolean;
  teamId: string;
  activityId: string;
  onToggle: () => void;
  /** Level, attendance and matches — present once a match level is chosen. */
  candidate?: CallupCandidate | undefined;
  scale: CallupLevelScale | null;
  exclusion: CallupExclusion | null;
  minAttendanceRate: number | null;
}) {
  const { t } = useTranslation();
  const respond = useRespondToCallup();
  const response: CallupResponse = invitation?.response ?? "pending";
  const initials =
    `${member.firstName.charAt(0)}${member.lastName.charAt(0)}`.toUpperCase();
  const label = t(`callups.response.${response}`);
  const onBehalf = invitation?.respondedBy?.onBehalf === true;

  return (
    <div
      className={cn(
        "bg-card flex items-center gap-3 rounded-lg px-4 py-3 transition-opacity duration-[120ms] ease-standard",
        // Out of the squad recedes rather than disappears — the roster stays
        // whole so a coach can see who is still available.
        !inSquad && "opacity-55",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          inSquad
            ? RESPONSE_DISC[response]
            : "bg-[var(--neutral-150)] text-[var(--neutral-650)]",
        )}
      >
        {inSquad ? RESPONSE_GLYPH[response] : initials}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">
          {formatMemberName(member)}
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
          {inSquad ? label : t("callups.notCalled")}
          {/* An answer a coach put there says so, and says who on hover. An
              answer nobody can trace is worse than no answer. */}
          {inSquad && onBehalf && (
            <span
              className="border-b border-dotted border-current"
              title={onBehalfTitle(
                invitation?.respondedBy ?? null,
                invitation?.respondedAt ?? null,
                {
                  by: (name) => t("callups.updatedByName", { name }),
                  unknown: t("callups.updatedByUnknown"),
                },
              )}
            >
              {t("callups.updatedByCoach")}
            </span>
          )}
        </span>
        {candidate && (
          <CandidateLine
            candidate={candidate}
            scale={scale}
            exclusion={exclusion}
            minAttendanceRate={minAttendanceRate}
          />
        )}
      </span>

      {/* Recording "he phoned to say he can't make it" — the way a good half
          of these answers actually arrive. */}
      {canAnswer && (
        <span className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant={response === "accepted" ? "brand" : "outline"}
            disabled={respond.isPending}
            aria-label={`${member.firstName} — ${t("callupsPage.accept")}`}
            onClick={() =>
              respond.mutate({
                teamId,
                activityId,
                memberId: member.id,
                response: "accepted",
              })
            }
          >
            ✓
          </Button>
          <Button
            size="sm"
            variant={response === "declined" ? "destructive" : "outline"}
            disabled={respond.isPending}
            aria-label={`${member.firstName} — ${t("callupsPage.decline")}`}
            onClick={() =>
              respond.mutate({
                teamId,
                activityId,
                memberId: member.id,
                response: "declined",
              })
            }
          >
            ✕
          </Button>
        </span>
      )}

      {canManage ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={inSquad}
          aria-label={`${formatMemberName(member)} — ${
            inSquad ? label : t("callups.notCalled")
          }`}
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-bold transition-transform duration-[120ms] ease-standard active:scale-[0.97]",
            inSquad
              ? "bg-ink text-white"
              : "border-2 border-dashed border-[var(--border-dashed)] text-[var(--neutral-500)]",
          )}
        >
          {inSquad ? "✓" : "+"}
        </button>
      ) : (
        inSquad && (
          <span
            className={cn(
              "rounded-pill px-3 py-1 text-xs font-bold",
              RESPONSE_DISC[response],
            )}
          >
            {label}
          </span>
        )
      )}
    </div>
  );
}

/**
 * The match level, the mix it asks for and how full each slot is with the
 * squad on screen. Proposing replaces the picked squad but saves nothing —
 * a proposal is a draft like any other (ADR-013).
 */
function CriteriaPanel({
  templates,
  criteria,
  scale,
  period,
  loading,
  squad,
  suggestion,
  onChange,
  onPropose,
}: {
  templates: CallupTemplate[];
  criteria: CallupCriteria | null;
  scale: CallupLevelScale | null;
  period: { seasonName: string | null } | null;
  loading: boolean;
  squad: CallupCandidate[];
  suggestion: SquadSuggestion | null;
  onChange: (criteria: CallupCriteria | null) => void;
  onPropose: () => void;
}) {
  const { t } = useTranslation();
  const NONE = "__none__";

  if (templates.length === 0 && criteria === null) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("callupCriteria.noTemplates")}
      </p>
    );
  }

  const fill = criteria ? slotFill(squad, criteria.slots) : null;
  const coachChildrenPicked = squad.filter(isCoachChild);
  const wanted = criteria?.slots.reduce((sum, slot) => sum + slot.count, 0) ?? 0;

  const setCount = (index: number, count: number) => {
    if (!criteria) return;
    onChange({
      ...criteria,
      slots: criteria.slots.map((slot, i) =>
        i === index ? { ...slot, count: Math.max(1, count) } : slot,
      ),
    });
  };

  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl p-4 kit:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <span className="kit-overline">{t("callupCriteria.level")}</span>
          <Select
            value={criteria?.templateId ?? NONE}
            onValueChange={(value) => {
              const template = templates.find((one) => one.id === value);
              onChange(template ? criteriaFromTemplate(template) : null);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("callupCriteria.noLevel")}</SelectItem>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {criteria && (
          <div className="flex w-40 flex-col gap-1.5">
            <label htmlFor="callup-min-rate" className="kit-overline">
              {t("callupCriteria.minRate")}
            </label>
            <Input
              id="callup-min-rate"
              inputMode="numeric"
              value={
                criteria.minAttendanceRate === null
                  ? ""
                  : String(criteria.minAttendanceRate)
              }
              placeholder="—"
              onChange={(event) => {
                const raw = event.target.value.trim();
                const value = Number(raw);
                if (raw !== "" && (!Number.isInteger(value) || value < 0 || value > 100)) {
                  return;
                }
                onChange({
                  ...criteria,
                  minAttendanceRate: raw === "" ? null : value,
                });
              }}
            />
          </div>
        )}

        {criteria && (
          <Button
            variant="brand"
            disabled={loading || scale === null}
            onClick={onPropose}
          >
            {t("callupCriteria.propose")}
          </Button>
        )}
      </div>

      {criteria && scale && fill && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {criteria.slots.map((slot, index) => {
              const filled = fill.filled[index] ?? 0;
              return (
                <div
                  key={index}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2",
                    filled >= slot.count
                      ? "bg-surface-present"
                      : "bg-secondary",
                  )}
                >
                  <span className="text-sm font-semibold">
                    {slotLabel(slot, scale)}
                  </span>
                  <span className="font-display text-lg leading-none">
                    {filled}
                    <span className="text-muted-foreground">/{slot.count}</span>
                  </span>
                  <span className="flex">
                    <button
                      type="button"
                      aria-label={t("callupCriteria.fewer", {
                        slot: slotLabel(slot, scale),
                      })}
                      disabled={slot.count <= 1}
                      onClick={() => setCount(index, slot.count - 1)}
                      className="hover:bg-card size-tap rounded-full text-sm font-bold disabled:opacity-30 kit:size-7"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      aria-label={t("callupCriteria.more", {
                        slot: slotLabel(slot, scale),
                      })}
                      onClick={() => setCount(index, slot.count + 1)}
                      className="hover:bg-card size-tap rounded-full text-sm font-bold kit:size-7"
                    >
                      +
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
          {criteria.minCoachChildren > 0 && (
            <p
              className={cn(
                "text-sm font-semibold",
                coachChildrenPicked.length < criteria.minCoachChildren &&
                  "text-absent",
              )}
            >
              {t("callupCriteria.coachChildren", {
                picked: coachChildrenPicked.length,
                wanted: criteria.minCoachChildren,
              })}
              {coachChildrenPicked.length > 0 &&
                ` · ${t("callupCriteria.coaching", {
                  names: [
                    ...new Set(coachChildrenPicked.flatMap((c) => c.coachNames)),
                  ].join(", "),
                })}`}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            {t("callupCriteria.wanted", { count: wanted })}
            {fill.unplaced.length > 0 &&
              ` · ${t("callupCriteria.unplaced", { count: fill.unplaced.length })}`}
            {" · "}
            {period?.seasonName
              ? t("callupCriteria.periodSeason", { season: period.seasonName })
              : t("callupCriteria.periodFallback")}
          </p>
        </div>
      )}

      {suggestion && scale && criteria && (
        <SuggestionSummary
          suggestion={suggestion}
          criteria={criteria}
          scale={scale}
        />
      )}
    </div>
  );
}

function SuggestionSummary({
  suggestion,
  criteria,
  scale,
}: {
  suggestion: SquadSuggestion;
  criteria: CallupCriteria;
  scale: CallupLevelScale;
}) {
  const { t } = useTranslation();
  const low = suggestion.excluded.filter((one) => one.reason === "lowAttendance").length;
  const noLevel = suggestion.excluded.filter((one) => one.reason === "noLevel").length;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="font-semibold">
        {t("callupCriteria.proposed", { count: suggestion.picked.length })}
      </p>
      {suggestion.coachChildrenMissing > 0 && (
        <p className="text-absent">
          {t("callupCriteria.noCoach", {
            count: suggestion.coachChildrenMissing,
          })}
        </p>
      )}
      {suggestion.unfilled.map((one) => {
        const slot = criteria.slots[one.slotIndex];
        if (!slot) return null;
        return (
          <p key={one.slotIndex} className="text-absent">
            {t("callupCriteria.short", {
              count: one.missing,
              slot: slotLabel(slot, scale),
            })}
          </p>
        );
      })}
      {(low > 0 || noLevel > 0) && (
        <p className="text-muted-foreground">
          {[
            low > 0 && t("callupCriteria.excludedLow", { count: low }),
            noLevel > 0 && t("callupCriteria.excludedNoLevel", { count: noLevel }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

/** "Lätt/Medel · 82 % träning · 3 matcher" — why a player was or was not proposed. */
function CandidateLine({
  candidate,
  scale,
  exclusion,
  minAttendanceRate,
}: {
  candidate: CallupCandidate;
  scale: CallupLevelScale | null;
  exclusion: CallupExclusion | null;
  minAttendanceRate: number | null;
}) {
  const { t } = useTranslation();
  const parts = [
    candidate.level === null || scale === null
      ? t("callupCriteria.levelUnknown")
      : levelName(scale, candidate.level),
    candidate.attendanceRate === null
      ? t("callupCriteria.noTraining")
      : t("callupCriteria.training", { rate: candidate.attendanceRate }),
    t("callupCriteria.matches", { count: candidate.matchesPlayed }),
  ];
  return (
    <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
      {parts.join(" · ")}
      {isCoachChild(candidate) && (
        <span
          className="rounded-pill bg-secondary text-foreground px-2 py-px text-[11px] font-bold"
          title={candidate.coachNames.join(", ")}
        >
          {t("callupCriteria.coachChild")}
        </span>
      )}
      {exclusion && (
        <span className="rounded-pill bg-surface-absent text-absent px-2 py-px text-[11px] font-bold">
          {exclusion === "noLevel"
            ? t("callupCriteria.exclusion.noLevel")
            : t("callupCriteria.exclusion.lowAttendance", {
                rate: minAttendanceRate ?? 0,
              })}
        </span>
      )}
    </span>
  );
}
