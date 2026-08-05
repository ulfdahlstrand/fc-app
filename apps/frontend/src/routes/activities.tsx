/** Calendar & activities (issue #12) — the team's hub. */
import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Activity, ActivityType } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ActivityFormDialog } from "../components/ActivityFormDialog";
import {
  toActivityInput,
  toRecurrenceInput,
  useActivities,
  useCreateActivity,
  useCreateRecurringActivities,
  type ActivityFormOutput,
} from "../lib/activities";
import {
  ACTIVITY_COLOUR_CHIP,
  ACTIVITY_COLOUR_DOT,
  useActivityTypes,
} from "../lib/activity-types";
import { ensureMe } from "../lib/auth";
import { useIsPhone } from "../lib/breakpoint";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import { useSeasons } from "../lib/seasons";
import {
  formatDateRange,
  formatDayHeading,
  formatMonthTitle,
  formatTimeRange,
  isSameDay,
  isSameMonth,
  monthGridDays,
  monthGridRange,
  SEPARATOR,
  shiftMonth,
  startOfMonth,
  useDateLocale,
  weekdayLabels,
} from "../lib/dates";

export const Route = createFileRoute("/activities")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: ActivitiesPage,
});

type View = "month" | "list";

/** Sentinels — an empty string would be a real filter value, and Radix
 *  disallows an empty-string select item. */
const ALL_TYPES = "__all__";
const ALL_SEASONS = "__all__";

function ActivitiesPage() {
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
        <AlertDescription>{t("activities.forbidden")}</AlertDescription>
      </Alert>
    );
  }

  return <Calendar teamId={selected.team.id} />;
}

function Calendar({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const canManage = useHasPermission("activities.manage");

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [view, setView] = useState<View>("month");
  const isPhone = useIsPhone();
  const [typeId, setTypeId] = useState(ALL_TYPES);
  const [seasonId, setSeasonId] = useState(ALL_SEASONS);
  /** The day a "+" was clicked on; also the flag that opens the create dialog. */
  const [creatingOn, setCreatingOn] = useState<Date | null>(null);

  const seasons = useSeasons(teamId);
  // A season spans months, so it only makes sense as the *list's* window; the
  // month grid always draws its own month.
  const bySeason = view === "list" && seasonId !== ALL_SEASONS;
  const season = seasons.data?.seasons.find((one) => one.id === seasonId);

  const range = useMemo(() => monthGridRange(month), [month]);
  const activities = useActivities(teamId, {
    ...(bySeason ? { seasonId } : range),
    ...(typeId === ALL_TYPES ? {} : { activityTypeId: typeId }),
  });
  // Archived types are included: an activity filed under a retired type still
  // has to render with its colour and name.
  const activityTypes = useActivityTypes(teamId, true);
  const createActivity = useCreateActivity(teamId);
  const createSeries = useCreateRecurringActivities(teamId);

  const typesById = useMemo(() => {
    const map = new Map<string, ActivityType>();
    for (const type of activityTypes.data?.activityTypes ?? []) {
      map.set(type.id, type);
    }
    return map;
  }, [activityTypes.data]);

  const selectableTypes = (activityTypes.data?.activityTypes ?? []).filter(
    (type) => !type.archived,
  );

  // One dialog, two endpoints: a repeating activity is a whole series, and the
  // backend generates its occurrences in one transaction (#13).
  const handleCreate = async (form: ActivityFormOutput) => {
    if (form.repeats) {
      await createSeries.mutateAsync(toRecurrenceInput(form));
    } else {
      await createActivity.mutateAsync(toActivityInput(form));
    }
    setCreatingOn(null);
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kit-overline">
            {season
              ? `${season.name}${SEPARATOR}${formatDateRange(season.startsOn, season.endsOn, locale)}`
              : formatMonthTitle(month, locale)}
          </p>
          <h1 className="font-display text-4xl">{t("activities.heading")}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          {/* A season already fixes the window — stepping months inside it
              would only be a way to look at nothing. */}
          {!bySeason && (
            <>
              <Button
                size="icon"
                variant="outline"
                aria-label={t("activities.previousMonth")}
                onClick={() => setMonth((current) => shiftMonth(current, -1))}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                size="icon"
                variant="outline"
                aria-label={t("activities.nextMonth")}
                onClick={() => setMonth((current) => shiftMonth(current, 1))}
              >
                <ChevronRightIcon />
              </Button>
              <Button
                variant="outline"
                onClick={() => setMonth(startOfMonth(new Date()))}
              >
                {t("activities.today")}
              </Button>
            </>
          )}
          {canManage && (
            <Button onClick={() => setCreatingOn(new Date())}>
              {t("activities.new")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TypeFilter
          types={activityTypes.data?.activityTypes ?? []}
          value={typeId}
          onChange={setTypeId}
        />
        {view === "list" && (seasons.data?.seasons.length ?? 0) > 0 && (
          <Select value={seasonId} onValueChange={setSeasonId}>
            <SelectTrigger
              className="w-full kit:w-56"
              aria-label={t("seasons.filter")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SEASONS}>
                {t("seasons.allActivities")}
              </SelectItem>
              {seasons.data?.seasons.map((one) => (
                <SelectItem key={one.id} value={one.id}>
                  {one.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {activities.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : activities.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("activities.loadError")}</AlertDescription>
        </Alert>
      ) : view === "month" ? (
        <MonthGrid
          compact={isPhone}
          month={month}
          activities={activities.data.activities}
          typesById={typesById}
          canManage={canManage}
          onAdd={setCreatingOn}
        />
      ) : (
        <ActivityList
          activities={activities.data.activities}
          typesById={typesById}
        />
      )}

      {creatingOn !== null && (
        <ActivityFormDialog
          activityTypes={selectableTypes}
          day={creatingOn}
          saving={createActivity.isPending}
          errorMessage={
            createActivity.error === null
              ? null
              : (createActivity.error.message ?? t("activities.saveError"))
          }
          onSave={handleCreate}
          onClose={() => setCreatingOn(null)}
        />
      )}
    </div>
  );
}

/** Month / list, as one segmented pill — Kit's idle-fills-on-hover nav pill. */
function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (view: View) => void;
}) {
  const { t } = useTranslation();
  const options: { value: View; label: string }[] = [
    { value: "month", label: t("activities.viewMonth") },
    { value: "list", label: t("activities.viewList") },
  ];

  return (
    <div className="bg-secondary flex rounded-pill p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={view === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-pill px-4 py-1.5 text-sm font-bold transition-colors duration-[120ms] ease-standard",
            view === option.value
              ? "bg-ink text-white"
              : "text-muted-foreground hover:bg-[var(--neutral-250)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TypeFilter({
  types,
  value,
  onChange,
}: {
  types: ActivityType[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  // Retired types stay filterable only while they still label something; the
  // filter row keeps to the active ones.
  const options = types.filter((type) => !type.archived);
  if (options.length === 0) return null;

  return (
    // Kit: "filter pills scroll sideways past the gutter instead of wrapping".
    // `flex-none` on the row is what keeps it from collapsing to zero height
    // inside a column flex — the reference calls this out as a bug it hit.
    <div className="-mx-[var(--gutter)] flex flex-none overflow-x-auto px-[var(--gutter)] kit:mx-0 kit:overflow-visible kit:px-0">
      <div className="flex flex-none gap-2 kit:flex-wrap">
        <FilterChip
          active={value === ALL_TYPES}
          onClick={() => onChange(ALL_TYPES)}
        >
          {t("activities.allTypes")}
        </FilterChip>
        {options.map((type) => (
          <FilterChip
            key={type.id}
            active={value === type.id}
            onClick={() => onChange(type.id)}
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
    </div>
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
        // 44px is Kit's floor for a tap target, and `flex-none` +
        // `whitespace-nowrap` are the reference's second flex trap: an
        // inline-flex button inside a flex row otherwise shrinks to
        // min-content and wraps its own label.
        "inline-flex min-h-tap flex-none items-center gap-2 rounded-pill px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors duration-[120ms] ease-standard kit:min-h-0",
        active
          ? "bg-ink text-white"
          : "bg-card text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

function MonthGrid({
  compact,
  month,
  activities,
  typesById,
  canManage,
  onAdd,
}: {
  /** Phone shape: dots instead of chips, with the tapped day opening below. */
  compact: boolean;
  month: Date;
  activities: Activity[];
  typesById: Map<string, ActivityType>;
  canManage: boolean;
  onAdd: (day: Date) => void;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const days = useMemo(() => monthGridDays(month), [month]);
  const today = new Date();

  /**
   * Which day the phone grid has open. A month at 390px gives 48px a day —
   * enough for a date and a few dots, nowhere near enough for a chip that
   * says a time and a name. So the grid answers "is anything on?" and the
   * tapped day answers "what?", underneath it, without leaving the month.
   */
  const [openDay, setOpenDay] = useState<string | null>(null);
  const activitiesOn = (day: Date) =>
    activities.filter((activity) =>
      isSameDay(new Date(activity.startsAt), day),
    );

  // A month the user steps away from should not keep a day open from the
  // previous one, and today is the useful default when it is in view.
  const defaultOpen = isSameMonth(today, month) ? today.toDateString() : null;
  const open = openDay ?? defaultOpen;
  const openDate = days.find((day) => day.toDateString() === open) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1.5">
        {weekdayLabels(locale).map((label) => (
          <p
            key={label}
            className={cn("kit-overline", compact ? "text-center" : "px-2")}
          >
            {label}
          </p>
        ))}
      </div>

      <div className={cn("grid grid-cols-7", compact ? "gap-1" : "gap-1.5")}>
        {days.map((day) => {
          const inMonth = isSameMonth(day, month);
          const isToday = isSameDay(day, today);
          const dayActivities = activitiesOn(day);

          if (compact) {
            const isOpen = day.toDateString() === open;
            return (
              <button
                key={day.toISOString()}
                type="button"
                // The cell is the tap target, so it carries the 44px floor
                // itself rather than padding a smaller number inside it.
                className={cn(
                  "flex min-h-tap flex-col items-center justify-center gap-1 rounded-lg py-1.5 transition-colors duration-[120ms] ease-standard",
                  inMonth ? "bg-card" : "bg-[var(--neutral-100)]",
                  isOpen && "ring-2 ring-ink",
                )}
                aria-pressed={isOpen}
                aria-label={formatDayHeading(day, locale)}
                onClick={() => setOpenDay(day.toDateString())}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                    isToday && "bg-brand text-white",
                    !inMonth && "text-muted-foreground",
                  )}
                >
                  {day.getDate()}
                </span>
                {/* Three dots is the ceiling: a fourth would not read at this
                    size, and the count is on the day below anyway. */}
                <span className="flex h-1.5 items-center gap-0.5">
                  {dayActivities.slice(0, 3).map((activity) => (
                    <span
                      key={activity.id}
                      aria-hidden
                      className={cn(
                        "size-1.5 rounded-full",
                        ACTIVITY_COLOUR_DOT[
                          typesById.get(activity.activityTypeId)?.colour ??
                            "neutral"
                        ],
                        activity.cancelled && "opacity-40",
                      )}
                    />
                  ))}
                </span>
              </button>
            );
          }

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "group flex min-h-28 flex-col gap-1 rounded-lg p-2",
                inMonth ? "bg-card" : "bg-[var(--neutral-100)]",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-sm font-semibold",
                    isToday && "bg-brand text-white",
                    !inMonth && "text-muted-foreground",
                  )}
                >
                  {day.getDate()}
                </span>
                {canManage && inMonth && (
                  <button
                    type="button"
                    aria-label={t("activities.newOnDay")}
                    onClick={() => onAdd(day)}
                    className="text-muted-foreground hover:bg-secondary hover:text-foreground flex size-6 items-center justify-center rounded-full opacity-0 transition-opacity duration-[120ms] ease-standard group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <PlusIcon className="size-3.5" />
                  </button>
                )}
              </div>

              {dayActivities.map((activity) => (
                <ActivityChip
                  key={activity.id}
                  activity={activity}
                  type={typesById.get(activity.activityTypeId)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* The tapped day, in full. The desktop grid has room for its chips in
          the cell and needs none of this. */}
      {compact && openDate !== null && (
        <div className="mt-2 flex flex-col gap-[11px]">
          <p className="kit-overline">{formatDayHeading(openDate, locale)}</p>
          {activitiesOn(openDate).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("activities.nothingOnDay")}
            </p>
          ) : (
            activitiesOn(openDate).map((activity) => (
              <ActivityRow
                key={activity.id}
                activity={activity}
                type={typesById.get(activity.activityTypeId)}
              />
            ))
          )}
          {canManage && isSameMonth(openDate, month) && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onAdd(openDate)}
            >
              {t("activities.newOnDay")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One activity as a row. Shared by the list view and, on a phone, by the day
 * a compact month cell opens — the same fact should not be two shapes.
 *
 * On a phone the row is a grid: dot, then a column holding the time, the title
 * and the meta. Wrapping a flex row instead pushed the meta onto its own line
 * still glued right, which read as a second, unrelated row.
 */
function ActivityRow({
  activity,
  type,
}: {
  activity: Activity;
  type: ActivityType | undefined;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() =>
        navigate({
          to: "/activities/$activityId",
          params: { activityId: activity.id },
        })
      }
      className="bg-card hover:bg-secondary grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-0.5 rounded-lg p-4 text-left transition-colors duration-[120ms] ease-standard kit:flex kit:flex-wrap kit:items-center kit:rounded-md"
    >
      <span
        aria-hidden
        className={cn(
          "size-3 shrink-0 rounded-full",
          ACTIVITY_COLOUR_DOT[type?.colour ?? "neutral"],
        )}
      />
      <span className="font-semibold tabular-nums kit:w-28 kit:shrink-0">
        {formatTimeRange(activity.startsAt, activity.endsAt, locale)}
      </span>
      <span
        className={cn(
          "col-start-2 font-display text-lg",
          activity.cancelled && "line-through opacity-60",
        )}
      >
        {activity.title ?? type?.name ?? ""}
      </span>
      <span className="text-muted-foreground col-start-2 text-sm kit:ml-auto">
        {[
          activity.title === null ? null : type?.name,
          activity.location,
          activity.cancelled ? t("activities.cancelled") : null,
        ]
          .filter((part) => part !== null && part !== undefined)
          .join(SEPARATOR)}
      </span>
    </button>
  );
}

function ActivityChip({
  activity,
  type,
}: {
  activity: Activity;
  type: ActivityType | undefined;
}) {
  const navigate = useNavigate();
  const locale = useDateLocale();
  const label = activity.title ?? type?.name ?? "";

  return (
    <button
      type="button"
      onClick={() =>
        navigate({
          to: "/activities/$activityId",
          params: { activityId: activity.id },
        })
      }
      className={cn(
        "flex w-full items-baseline gap-1.5 truncate rounded-pill px-2.5 py-1 text-left text-xs font-semibold transition-transform duration-[120ms] ease-standard active:scale-[0.97]",
        ACTIVITY_COLOUR_CHIP[type?.colour ?? "neutral"],
        activity.cancelled && "line-through opacity-60",
      )}
    >
      <span className="tabular-nums">
        {formatTimeRange(activity.startsAt, null, locale)}
      </span>
      <span className="truncate font-medium">{label}</span>
    </button>
  );
}

function ActivityList({
  activities,
  typesById,
}: {
  activities: Activity[];
  typesById: Map<string, ActivityType>;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  // The API returns them in start order, so a plain run-length grouping keeps
  // the days in order too.
  const days = useMemo(() => {
    const groups: { day: Date; activities: Activity[] }[] = [];
    for (const activity of activities) {
      const day = new Date(activity.startsAt);
      const last = groups[groups.length - 1];
      if (last && isSameDay(last.day, day)) {
        last.activities.push(activity);
      } else {
        groups.push({ day, activities: [activity] });
      }
    }
    return groups;
  }, [activities]);

  if (days.length === 0) {
    return <p className="text-muted-foreground">{t("activities.empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {days.map((group) => (
        <div
          key={group.day.toDateString()}
          className="flex flex-col gap-[11px]"
        >
          <p className="kit-overline">{formatDayHeading(group.day, locale)}</p>
          {group.activities.map((activity) => (
            <ActivityRow
              key={activity.id}
              activity={activity}
              type={typesById.get(activity.activityTypeId)}
            />
          ))}{" "}
        </div>
      ))}
    </div>
  );
}
