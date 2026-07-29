/**
 * Activity detail (issue #12) — the anchor page attendance (#14) and call-ups
 * (#16) later extend with tabs.
 *
 * Requires members.view in the selected team; activities.manage unlocks edit
 * and cancel/restore. Cancelling never deletes: the activity keeps its place
 * on the calendar, struck through, so nobody turns up at the pitch for it.
 */
import { useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ActivityEditScope, ActivityType } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ActivityFormDialog } from "../components/ActivityFormDialog";
import { AttendanceSection } from "../components/AttendanceSection";
import { CallupSection } from "../components/CallupSection";
import {
  toActivityInput,
  useActivity,
  useSetActivityCancelled,
  useUpdateActivity,
  type ActivityFormOutput,
} from "../lib/activities";
import { useActivityTypes } from "../lib/activity-types";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import {
  formatDateLong,
  formatTimeRange,
  SEPARATOR,
  useDateLocale,
} from "../lib/dates";

type Tab = "info" | "attendance" | "callup";

export const Route = createFileRoute("/activities_/$activityId")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: ActivityDetailPage,
});

function ActivityDetailPage() {
  const { t } = useTranslation();
  const { activityId } = Route.useParams();
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

  return <ActivityDetail teamId={selected.team.id} activityId={activityId} />;
}

function ActivityDetail({
  teamId,
  activityId,
}: {
  teamId: string;
  activityId: string;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const canManage = useHasPermission("activities.manage");
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>("info");
  /** A submitted edit waiting for its scope answer (#13). */
  const [pending, setPending] = useState<ActivityFormOutput | null>(null);

  const activity = useActivity(teamId, activityId);
  const activityTypes = useActivityTypes(teamId, true);
  const updateActivity = useUpdateActivity(teamId);
  const setCancelled = useSetActivityCancelled(teamId);

  if (activity.isPending) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }
  if (activity.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("activities.notFound")}</AlertDescription>
      </Alert>
    );
  }

  const current = activity.data.activity;
  const types: ActivityType[] = activityTypes.data?.activityTypes ?? [];
  const type = types.find((candidate) => candidate.id === current.activityTypeId);
  const heading = current.title ?? type?.name ?? "";
  const tabs: Tab[] = type?.supportsCallUps
    ? ["info", "attendance", "callup"]
    : ["info", "attendance"];

  const save = async (form: ActivityFormOutput, scope: ActivityEditScope) => {
    await updateActivity.mutateAsync({
      activityId: current.id,
      scope,
      ...toActivityInput(form),
    });
    setEditing(false);
    setPending(null);
  };

  // An occurrence of a series asks how far the edit reaches before it saves;
  // a one-off has nothing to ask about (#13).
  const handleSave = async (form: ActivityFormOutput) => {
    if (current.seriesId === null) {
      await save(form, "occurrence");
      return;
    }
    setEditing(false);
    setPending(form);
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <Link
        to="/activities"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm font-semibold"
      >
        <ChevronLeftIcon className="size-4" />
        {t("activities.backToCalendar")}
      </Link>

      {/* Kit's "next fixture" card is ink, not green — green stays meaningful. */}
      <div className="bg-ink flex flex-col gap-3 rounded-xl px-7 py-6 text-white">
        <p className="kit-overline text-[var(--neutral-500)]">
          {[
            current.title === null ? null : type?.name,
            formatDateLong(current.startsAt, locale),
            formatTimeRange(current.startsAt, current.endsAt, locale),
            current.location,
          ]
            .filter((part) => part !== null && part !== undefined)
            .join(SEPARATOR)}
        </p>
        <h1
          className={cn(
            "font-display text-5xl",
            current.cancelled && "line-through opacity-60",
          )}
        >
          {heading}
        </h1>
        <div className="flex flex-wrap gap-2">
          {current.cancelled && (
            <span className="bg-destructive w-fit rounded-pill px-3 py-1 text-xs font-bold tracking-[1px] uppercase">
              {t("activities.cancelled")}
            </span>
          )}
          {current.seriesId !== null && (
            <span className="bg-ink-raised w-fit rounded-pill px-3 py-1 text-xs font-bold tracking-[1px] text-[var(--neutral-500)] uppercase">
              {t("activities.partOfSeries")}
            </span>
          )}
        </div>
      </div>

      {/* The detail page is the anchor #14 and #16 extend with tabs. The
          call-up tab appears only for types that can have a squad (#11). */}
      <div className="bg-secondary flex w-fit rounded-pill p-1">
        {tabs.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "rounded-pill px-4 py-1.5 text-sm font-bold transition-colors duration-[120ms] ease-standard",
              tab === value
                ? "bg-ink text-white"
                : "text-muted-foreground hover:bg-[var(--neutral-250)]",
            )}
          >
            {t(`activities.tab.${value}`)}
          </button>
        ))}
      </div>

      {tab === "attendance" ? (
        <AttendanceSection teamId={teamId} activity={current} />
      ) : tab === "callup" ? (
        <CallupSection teamId={teamId} activity={current} />
      ) : (
        <>
      <div className="bg-card flex flex-col gap-4 rounded-xl px-7 py-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label={t("activities.type")} value={type?.name ?? "—"} />
          <Detail
            label={t("activities.when")}
            value={`${formatDateLong(current.startsAt, locale)}${SEPARATOR}${formatTimeRange(
              current.startsAt,
              current.endsAt,
              locale,
            )}`}
          />
          <Detail
            label={t("activities.location")}
            value={current.location ?? "—"}
          />
        </dl>

        {current.notes !== null && (
          <div className="flex flex-col gap-1">
            <p className="kit-overline">{t("activities.notes")}</p>
            <p className="whitespace-pre-wrap">{current.notes}</p>
          </div>
        )}
      </div>

      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEditing(true)}>{t("common.edit")}</Button>
          <Button
            variant="outline"
            disabled={setCancelled.isPending}
            onClick={() =>
              setCancelled.mutate({
                activityId: current.id,
                cancelled: !current.cancelled,
              })
            }
          >
            {current.cancelled
              ? t("activities.restore")
              : t("activities.cancel")}
          </Button>
        </div>
      )}
        </>
      )}

      {editing && (
        <ActivityFormDialog
          activity={current}
          // A retired type stays on the activity that already uses it, but the
          // select only offers active ones — plus this activity's own type, so
          // an edit does not silently re-file it.
          activityTypes={types.filter(
            (candidate) => !candidate.archived || candidate.id === type?.id,
          )}
          saving={updateActivity.isPending}
          errorMessage={
            updateActivity.error === null
              ? null
              : (updateActivity.error.message ?? t("activities.saveError"))
          }
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}

      {pending !== null && (
        <Dialog open onOpenChange={(open) => !open && setPending(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("activities.scopeTitle")}</DialogTitle>
              <DialogDescription>
                {t("activities.scopeHelp")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Button
                disabled={updateActivity.isPending}
                onClick={() => save(pending, "occurrence")}
              >
                {t("activities.scopeOccurrence")}
              </Button>
              <Button
                variant="outline"
                disabled={updateActivity.isPending}
                onClick={() => save(pending, "following")}
              >
                {t("activities.scopeFollowing")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="kit-overline">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
