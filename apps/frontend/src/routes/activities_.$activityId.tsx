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
import type { ActivityType } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ActivityFormDialog } from "../components/ActivityFormDialog";
import {
  useActivity,
  useSetActivityCancelled,
  useUpdateActivity,
  type ActivityWriteInput,
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

  const handleSave = async (input: ActivityWriteInput) => {
    await updateActivity.mutateAsync({ activityId: current.id, ...input });
    setEditing(false);
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
        {current.cancelled && (
          <span className="bg-destructive w-fit rounded-pill px-3 py-1 text-xs font-bold tracking-[1px] uppercase">
            {t("activities.cancelled")}
          </span>
        )}
      </div>

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
