/** A member's attendance history (issue #15) on the member detail page. */
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ActivityType, AttendanceStatus } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { ACTIVITY_COLOUR_DOT, useActivityTypes } from "@/lib/activity-types";
import { ATTENDANCE_TOGGLE } from "@/lib/attendance";
import { useAttendanceStatuses } from "@/lib/attendance-statuses";
import { useMemberAttendance } from "@/lib/attendance-stats";
import { formatDateLong, SEPARATOR, useDateLocale } from "@/lib/dates";

export function MemberAttendanceSection({
  teamId,
  memberId,
}: {
  teamId: string;
  memberId: string;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const history = useMemberAttendance(teamId, memberId);
  // Archived included: a mark made under a retired status still has to render.
  const statuses = useAttendanceStatuses(teamId, true);
  const types = useActivityTypes(teamId, true);

  const statusById = useMemo(() => {
    const map = new Map<string, AttendanceStatus>();
    for (const status of statuses.data?.attendanceStatuses ?? []) {
      map.set(status.id, status);
    }
    return map;
  }, [statuses.data]);

  const typeById = useMemo(() => {
    const map = new Map<string, ActivityType>();
    for (const type of types.data?.activityTypes ?? []) map.set(type.id, type);
    return map;
  }, [types.data]);

  if (history.isPending) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }
  if (history.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("statistics.loadError")}</AlertDescription>
      </Alert>
    );
  }

  const { entries, stats } = history.data;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl">{t("statistics.history")}</h2>
        {stats.rate !== null && (
          <p className="text-muted-foreground text-sm">
            {`${stats.attended}/${stats.marked}`}
            {SEPARATOR}
            <span className="text-foreground font-semibold">
              {stats.rate}%
            </span>
          </p>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground">{t("statistics.noHistory")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => {
            const status =
              entry.statusId === null ? undefined : statusById.get(entry.statusId);
            const type = typeById.get(entry.activityTypeId);
            return (
              <Link
                key={entry.activityId}
                to="/activities/$activityId"
                params={{ activityId: entry.activityId }}
                className="bg-card hover:bg-secondary flex flex-wrap items-center gap-3 rounded-md px-4 py-3 transition-colors duration-[120ms] ease-standard"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-3 shrink-0 rounded-full",
                    ACTIVITY_COLOUR_DOT[type?.colour ?? "neutral"],
                  )}
                />
                <span className="text-sm font-semibold">
                  {formatDateLong(entry.startsAt, locale)}
                </span>
                <span className="text-muted-foreground text-sm">
                  {entry.title ?? type?.name ?? ""}
                </span>
                <span
                  className={cn(
                    "ml-auto rounded-pill px-3 py-1 text-xs font-bold",
                    status
                      ? ATTENDANCE_TOGGLE[status.colour]
                      : "border-2 border-dashed border-[var(--border-dashed)] text-[var(--neutral-500)]",
                  )}
                >
                  {status?.name ?? t("attendance.unmarked")}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
