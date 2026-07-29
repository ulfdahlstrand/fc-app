/**
 * Attendance statistics (issue #15) — who is actually turning up.
 *
 * Requires members.view in the selected team. Filters narrow by period,
 * season, activity type and group, and they combine: each one is another
 * `where`, not a replacement.
 *
 * The table is sorted by the backend, lowest rate first. The page exists to
 * surface who is drifting away, and that name should not be somewhere in the
 * middle of an alphabet.
 */
import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ActivityType, MemberAttendanceStats } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ACTIVITY_COLOUR_DOT, useActivityTypes } from "../lib/activity-types";
import {
  downloadCsv,
  isAtRisk,
  statsToCsv,
  useAttendanceStats,
} from "../lib/attendance-stats";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import { fromDateTimeInput } from "../lib/dates";
import { useGroups } from "../lib/groups";
import { useSeasons } from "../lib/seasons";

export const Route = createFileRoute("/statistics")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: StatisticsPage,
});

/** Sentinels — Radix disallows an empty-string select item. */
const ALL = "__all__";

function StatisticsPage() {
  const { t } = useTranslation();
  const selected = useSelectedTeam();
  const canView = useHasPermission("members.view");

  if (!selected) {
    return (
      <Alert>
        <AlertDescription>{t("members.noTeam")}</AlertDescription>
      </Alert>
    );
  }
  if (!canView) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("statistics.forbidden")}</AlertDescription>
      </Alert>
    );
  }

  return <Statistics teamId={selected.team.id} teamName={selected.team.name} />;
}

function Statistics({
  teamId,
  teamName,
}: {
  teamId: string;
  teamName: string;
}) {
  const { t } = useTranslation();

  const [seasonId, setSeasonId] = useState(ALL);
  const [typeId, setTypeId] = useState(ALL);
  const [groupId, setGroupId] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const seasons = useSeasons(teamId);
  const groups = useGroups(teamId);
  const activityTypes = useActivityTypes(teamId, true);

  const filters = {
    ...(seasonId === ALL ? {} : { seasonId }),
    ...(typeId === ALL ? {} : { activityTypeId: typeId }),
    ...(groupId === ALL ? {} : { groupId }),
    // A bare date means local midnight; the API takes instants.
    ...(from ? { from: fromDateTimeInput(`${from}T00:00`) } : {}),
    ...(to ? { to: fromDateTimeInput(`${to}T23:59`) } : {}),
  };
  const stats = useAttendanceStats(teamId, filters);

  const types = activityTypes.data?.activityTypes ?? [];
  const typesById = useMemo(() => {
    const map = new Map<string, ActivityType>();
    for (const type of types) map.set(type.id, type);
    return map;
  }, [types]);

  const members = stats.data?.members ?? [];
  const atRisk = members.filter(isAtRisk);

  /** The overline: what the numbers below are actually about. */
  const scope = [
    seasons.data?.seasons.find((one) => one.id === seasonId)?.name,
    typesById.get(typeId)?.name,
    groups.data?.groups.find((one) => one.id === groupId)?.name,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");

  const exportCsv = () => {
    downloadCsv(
      `${teamName}-${t("statistics.heading")}.csv`.replace(/\s+/g, "-"),
      statsToCsv(members, {
        name: t("statistics.member"),
        attended: t("statistics.attended"),
        marked: t("statistics.marked"),
        rate: t("statistics.rate"),
      }),
    );
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kit-overline">{scope || t("statistics.allTime")}</p>
          <h1 className="font-display text-4xl">{t("statistics.heading")}</h1>
        </div>
        <Button
          variant="outline"
          onClick={exportCsv}
          disabled={members.length === 0}
        >
          {t("statistics.export")}
        </Button>
      </div>

      {/* Type chips first — it is the filter a coach reaches for most. */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={typeId === ALL} onClick={() => setTypeId(ALL)}>
          {t("activities.allTypes")}
        </FilterChip>
        {types
          .filter((type) => !type.archived)
          .map((type) => (
            <FilterChip
              key={type.id}
              active={typeId === type.id}
              onClick={() => setTypeId(type.id)}
            >
              <span
                aria-hidden
                className={cn(
                  "size-2.5 rounded-full",
                  ACTIVITY_COLOUR_DOT[type.colour],
                )}
              />
              {type.name}
            </FilterChip>
          ))}
      </div>

      <div className="bg-card flex flex-wrap items-end gap-4 rounded-xl px-6 py-5">
        {(seasons.data?.seasons.length ?? 0) > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="season-filter">{t("seasons.filter")}</Label>
            <Select value={seasonId} onValueChange={setSeasonId}>
              <SelectTrigger id="season-filter" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("statistics.allTime")}</SelectItem>
                {seasons.data?.seasons.map((season) => (
                  <SelectItem key={season.id} value={season.id}>
                    {season.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from-filter">{t("statistics.from")}</Label>
          <Input
            id="from-filter"
            type="date"
            className="w-44"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to-filter">{t("statistics.to")}</Label>
          <Input
            id="to-filter"
            type="date"
            className="w-44"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>

        {(groups.data?.groups.length ?? 0) > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-filter">{t("groups.filterLabel")}</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger id="group-filter" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("groups.allMembers")}</SelectItem>
                {groups.data?.groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {stats.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : stats.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("statistics.loadError")}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-[14px] sm:grid-cols-3">
            <StatCard
              label={t("statistics.teamRate")}
              value={
                stats.data.teamRate === null ? "—" : `${stats.data.teamRate}%`
              }
              footnote={t("statistics.teamRateHint")}
            />
            <StatCard
              label={t("statistics.sessions")}
              value={String(stats.data.activities)}
              footnote={t("statistics.sessionsHint")}
            />
            {/* Orange means a person has to do something about it. */}
            <StatCard
              label={t("statistics.atRisk")}
              value={String(atRisk.length)}
              footnote={t("statistics.atRiskHint")}
              tone={atRisk.length > 0 ? "alert" : "ink"}
            />
          </div>

          {members.length === 0 ? (
            <p className="text-muted-foreground">{t("statistics.empty")}</p>
          ) : (
            <div className="flex flex-col gap-[11px]">
              {members.map((member) => (
                <MemberRow key={member.memberId} member={member} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Kit's stat block: 54px Anton on ink, orange when someone must act. */
function StatCard({
  label,
  value,
  footnote,
  tone = "ink",
}: {
  label: string;
  value: string;
  footnote: string;
  tone?: "ink" | "alert";
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-center gap-1.5 rounded-xl p-6",
        tone === "alert" ? "bg-destructive text-white" : "bg-ink text-white",
      )}
    >
      <span
        className={cn(
          "kit-overline",
          tone === "alert"
            ? "text-[var(--orange-200)]"
            : "text-[var(--neutral-550)]",
        )}
      >
        {label}
      </span>
      <span className="font-display text-5xl leading-none">{value}</span>
      <span
        className={cn(
          "text-xs font-semibold",
          tone === "alert"
            ? "text-[var(--orange-200)]"
            : "text-[var(--text-signal)]",
        )}
      >
        {footnote}
      </span>
    </div>
  );
}

function MemberRow({ member }: { member: MemberAttendanceStats }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const initials =
    `${member.firstName.charAt(0)}${member.lastName.charAt(0)}`.toUpperCase();

  return (
    <button
      type="button"
      onClick={() =>
        navigate({
          to: "/members/$memberId",
          params: { memberId: member.memberId },
        })
      }
      className="bg-card hover:bg-secondary flex items-center gap-4 rounded-md px-4 py-3 text-left transition-colors duration-[120ms] ease-standard"
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--neutral-150)] text-sm font-bold text-[var(--neutral-650)]"
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold">
        {member.firstName} {member.lastName}
      </span>
      <AttendanceMeter member={member} />
      <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
        {member.rate === null ? (
          <span className="text-muted-foreground">
            {t("statistics.notMarked")}
          </span>
        ) : (
          `${member.attended}/${member.marked}`
        )}
      </span>
      <span
        className={cn(
          "w-14 shrink-0 text-right font-display text-2xl leading-none",
          isAtRisk(member) && "text-absent",
        )}
      >
        {member.rate === null ? "—" : `${member.rate}%`}
      </span>
    </button>
  );
}

/** Kit's thin capsule meter, always paired with a fraction label. */
function AttendanceMeter({ member }: { member: MemberAttendanceStats }) {
  return (
    <span
      aria-hidden
      className="hidden h-[7px] w-40 shrink-0 overflow-hidden rounded-full bg-[var(--neutral-250)] sm:block"
    >
      <span
        className={cn(
          "block h-full",
          isAtRisk(member) ? "bg-[var(--orange-500)]" : "bg-brand",
        )}
        style={{ width: `${member.rate ?? 0}%` }}
      />
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-semibold transition-colors duration-[120ms] ease-standard",
        active ? "bg-ink text-white" : "bg-card text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}
