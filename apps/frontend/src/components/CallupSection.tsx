/** Call-up — squad selection (issue #16). */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  Activity,
  CallupInvitation,
  CallupResponse,
  Member,
} from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { useMembers } from "@/lib/members";

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
  const dirty = squadChanged(squad, saved);

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
      <div className="bg-ink flex flex-wrap items-end justify-between gap-4 rounded-xl px-7 py-6 text-white">
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

      <div className="grid gap-[11px] md:grid-cols-2">
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
          />
        ))}
      </div>

      {canManage && (
        // Kit: the save bar never scrolls away.
        <div className="bg-background sticky bottom-0 flex flex-wrap items-center justify-between gap-3 py-3">
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
                onClick={() => setSquad(saved)}
              >
                {t("attendance.discard")}
              </Button>
            )}
            <Button
              disabled={!dirty || saveSquad.isPending}
              onClick={() => saveSquad.mutate([...squad])}
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
          {member.firstName} {member.lastName}
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
          aria-label={`${member.firstName} ${member.lastName} — ${
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
