/** Attendance registration (issue #14) — the screen Kit was designed for. */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity, AttendanceStatus, Member } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_AVATAR,
  ATTENDANCE_ROW_TINT,
  ATTENDANCE_TOGGLE,
  ATTENDANCE_TOGGLE_UNMARKED,
  changedEntries,
  nextMark,
  statusGlyph,
  useAttendance,
  useSetAttendance,
  type Marks,
} from "@/lib/attendance";
import { useAttendanceStatuses } from "@/lib/attendance-statuses";
import { useHasPermission } from "@/lib/clubs";
import { useMembers } from "@/lib/members";

export function AttendanceSection({
  teamId,
  activity,
}: {
  teamId: string;
  activity: Activity;
}) {
  const { t } = useTranslation();
  const canRecord = useHasPermission("attendance.record");

  const members = useMembers(teamId, {});
  // Archived statuses are included so a record made under a retired status
  // still renders with its name and colour.
  const statuses = useAttendanceStatuses(teamId, true);
  const attendance = useAttendance(teamId, activity.id);
  const save = useSetAttendance(teamId, activity.id);

  /** What the API has. */
  const saved = useMemo<Marks>(() => {
    const marks: Marks = {};
    for (const record of attendance.data?.records ?? []) {
      marks[record.memberId] = record.statusId;
    }
    return marks;
  }, [attendance.data]);

  /** What the coach has tapped, before saving. */
  const [marks, setMarks] = useState<Marks>({});
  // Adopt the server's answer whenever it changes — on load, and after a save.
  useEffect(() => setMarks(saved), [saved]);

  const roster = members.data?.members ?? [];
  const all = statuses.data?.attendanceStatuses ?? [];
  const byId = useMemo(() => {
    const map = new Map<string, AttendanceStatus>();
    for (const status of all) map.set(status.id, status);
    return map;
  }, [all]);
  /** Only active statuses are in the tap cycle; archived ones still render. */
  const cycle = all.filter((status) => !status.archived);
  const presentStatus = cycle.find((status) => status.countsAsPresent);

  const present = roster.filter(
    (member) => byId.get(marks[member.id] ?? "")?.countsAsPresent === true,
  ).length;
  const pending = changedEntries(marks, saved);

  if (members.isPending || statuses.isPending || attendance.isPending) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }
  if (members.isError || statuses.isError || attendance.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("attendance.loadError")}</AlertDescription>
      </Alert>
    );
  }
  if (roster.length === 0) {
    return <p className="text-muted-foreground">{t("attendance.noMembers")}</p>;
  }
  if (cycle.length === 0) {
    return <p className="text-muted-foreground">{t("attendance.noStatuses")}</p>;
  }

  const markAllUnmarked = () => {
    if (!presentStatus) return;
    setMarks((current) => {
      const next = { ...current };
      for (const member of roster) {
        if ((next[member.id] ?? null) === null) next[member.id] = presentStatus.id;
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Kit's matchday hero: green at full strength, the count louder than
          anything else on the page, "All here" right next to it. */}
      <div className="bg-brand relative flex flex-wrap items-end justify-between gap-4 overflow-hidden rounded-xl px-7 py-6 text-white">
        <div
          aria-hidden
          className="absolute -top-24 -right-16 size-64 rounded-full bg-[var(--glow-hero)]"
        />
        <div className="relative flex flex-col gap-1">
          <p className="kit-overline text-[var(--text-on-brand-muted)]">
            {t("attendance.heading")}
          </p>
          {canRecord && presentStatus && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-1 w-fit"
              onClick={markAllUnmarked}
            >
              {t("attendance.allHere")}
            </Button>
          )}
        </div>
        <div className="relative flex flex-col items-end">
          <span className="font-display text-6xl leading-none">
            {present}
            <span className="text-[var(--green-200)]">/{roster.length}</span>
          </span>
          <span className="kit-overline text-[var(--text-on-brand-muted)]">
            {t("attendance.checkedIn")}
          </span>
        </div>
      </div>

      <div className="grid gap-[11px] md:grid-cols-2">
        {roster.map((member) => (
          <AttendanceRow
            key={member.id}
            member={member}
            status={byId.get(marks[member.id] ?? "")}
            canRecord={canRecord}
            onCycle={() =>
              setMarks((current) => ({
                ...current,
                [member.id]: nextMark(current[member.id] ?? null, cycle),
              }))
            }
          />
        ))}
      </div>

      {canRecord && (
        // Kit: the save bar never scrolls away.
        <div className="bg-background sticky bottom-0 flex flex-wrap items-center justify-between gap-3 py-3">
          <p className="text-muted-foreground text-sm">
            {t("attendance.marked", {
              count: roster.filter((m) => (marks[m.id] ?? null) !== null).length,
              total: roster.length,
            })}
          </p>
          <div className="flex gap-2">
            {pending.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setMarks(saved)}
                disabled={save.isPending}
              >
                {t("attendance.discard")}
              </Button>
            )}
            <Button
              disabled={pending.length === 0 || save.isPending}
              onClick={() => save.mutate(pending)}
            >
              {t("attendance.save", { count: pending.length })}
            </Button>
          </div>
        </div>
      )}

      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {save.error.message ?? t("attendance.saveError")}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function AttendanceRow({
  member,
  status,
  canRecord,
  onCycle,
}: {
  member: Member;
  status: AttendanceStatus | undefined;
  canRecord: boolean;
  onCycle: () => void;
}) {
  const { t } = useTranslation();
  const initials =
    `${member.firstName.charAt(0)}${member.lastName.charAt(0)}`.toUpperCase();
  const label = status?.name ?? t("attendance.unmarked");

  return (
    <div
      className={cn(
        "bg-card flex items-center gap-3 rounded-lg px-4 py-3",
        status && ATTENDANCE_ROW_TINT[status.colour],
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          status
            ? ATTENDANCE_AVATAR[status.colour]
            : "bg-[var(--neutral-150)] text-[var(--neutral-650)]",
        )}
      >
        {initials}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">
          {member.firstName} {member.lastName}
        </span>
        <span className="text-muted-foreground text-xs">{label}</span>
      </span>

      {canRecord ? (
        // 48px round toggle — the single most-tapped control in the app, and
        // Kit says it must never drop under 44.
        <button
          type="button"
          onClick={onCycle}
          aria-label={`${member.firstName} ${member.lastName} — ${label}`}
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-bold transition-transform duration-[120ms] ease-standard active:scale-[0.97]",
            status
              ? ATTENDANCE_TOGGLE[status.colour]
              : ATTENDANCE_TOGGLE_UNMARKED,
          )}
        >
          {status ? statusGlyph(status) : "?"}
        </button>
      ) : (
        <span
          className={cn(
            "rounded-pill px-3 py-1 text-xs font-bold",
            status
              ? ATTENDANCE_TOGGLE[status.colour]
              : ATTENDANCE_TOGGLE_UNMARKED,
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}
