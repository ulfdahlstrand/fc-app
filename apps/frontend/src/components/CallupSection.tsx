/**
 * Call-up — squad selection (issue #16).
 *
 * Two things share one row, as they do throughout Kit: the **disc** carries
 * state (the member's reply) and the **toggle** performs the action (in or out
 * of the squad). A pending reply is the dashed ring, because in Kit dashed
 * always means "not decided yet".
 *
 * Picking is separated from telling. The squad stays a draft until a coach
 * publishes it, so choosing fourteen names never makes a phone buzz on each
 * tap. Members can be added or removed after publishing — replacing someone
 * who declined is the ordinary case, not an exception.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity, CallupResponse, Member } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  countResponses,
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
  // Counts follow what is on screen, so the number moves with the taps.
  const counts = countResponses(
    [...squad].map((memberId) => ({
      response: responses.get(memberId) ?? "pending",
    })),
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
            response={responses.get(member.id) ?? "pending"}
            canManage={canManage}
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
  response,
  canManage,
  onToggle,
}: {
  member: Member;
  inSquad: boolean;
  response: CallupResponse;
  canManage: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const initials =
    `${member.firstName.charAt(0)}${member.lastName.charAt(0)}`.toUpperCase();
  const label = t(`callups.response.${response}`);

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
        <span className="text-muted-foreground text-xs">
          {inSquad ? label : t("callups.notCalled")}
        </span>
      </span>

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
