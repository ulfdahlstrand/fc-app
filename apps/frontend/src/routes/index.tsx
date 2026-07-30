/**
 * Dashboard (issue #20) — the landing page inside a team context.
 *
 * Everything here already has a page of its own. This one exists to answer
 * "what needs me today?" in a glance, and then get out of the way: every
 * number links to the page that can act on it.
 *
 * One query feeds the whole screen (`useDashboard`), so the page arrives in
 * one piece rather than as a stack of boxes settling one after another.
 *
 * Widgets appear by permission, not by role. A parent sees the questions they
 * have been asked; a coach sees those *and* the team's numbers. Neither is
 * shown an empty frame belonging to the other — a null widget is not rendered
 * at all, while an empty one states plainly that there is nothing there yet.
 *
 * Four widgets: what's next (#12), what this user owes an answer to (#17), how
 * attendance is trending (#15), and which tracking lists are still outstanding
 * (#19).
 */
import { useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type {
  DashboardActivity,
  DashboardAttendance,
  DashboardTrackingList,
  MyCallup,
} from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACTIVITY_COLOUR_DOT } from "../lib/activity-types";
import { ensureMe } from "../lib/auth";
import { useRespondToCallup } from "../lib/callup-responses";
import { ensureMyClubs, useSelectedTeam } from "../lib/clubs";
import { attendanceDelta, useDashboard } from "../lib/dashboard";
import {
  formatDayHeading,
  formatTime,
  formatTimeRange,
  SEPARATOR,
  useDateLocale,
} from "../lib/dates";
import { takePendingInvite } from "../lib/invitations";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    // A user who signed in to accept an invite lands here — send them on to
    // the invite before the onboarding redirect fires.
    const pendingInvite = takePendingInvite();
    if (pendingInvite) {
      throw redirect({ to: "/invite/$token", params: { token: pendingInvite } });
    }
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();
  const selected = useSelectedTeam();

  if (!selected) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-4xl">{t("home.heading")}</h1>
        <Alert>
          <AlertDescription>{t("members.noTeam")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <Dashboard
      teamId={selected.team.id}
      teamName={selected.team.name}
      clubName={selected.club.name}
    />
  );
}

function Dashboard({
  teamId,
  teamName,
  clubName,
}: {
  teamId: string;
  teamName: string;
  clubName: string;
}) {
  const { t } = useTranslation();
  const dashboard = useDashboard(teamId);

  const upcoming = dashboard.data?.upcoming ?? null;
  const attendance = dashboard.data?.attendance ?? null;
  const callupsPending = dashboard.data?.callupsPending ?? null;
  const myPending = dashboard.data?.myPendingCallups ?? [];
  const trackingLists = dashboard.data?.tracking?.lists ?? null;

  const [next, ...rest] = upcoming ?? [];

  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <p className="kit-overline">{clubName}</p>
        <h1 className="font-display text-4xl">{teamName}</h1>
      </div>

      {dashboard.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : dashboard.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("dashboard.loadError")}</AlertDescription>
        </Alert>
      ) : (
        <>
          {/* The questions this user owes an answer to come first — for most
              parents this is the entire dashboard. */}
          {myPending.length > 0 && <MyCallups callups={myPending} />}

          {upcoming !== null &&
            (next === undefined ? (
              <EmptyHero />
            ) : (
              <Hero activity={next} />
            ))}

          {attendance !== null && (
            <StatRow
              attendance={attendance}
              callupsPending={callupsPending ?? 0}
            />
          )}

          {trackingLists !== null && trackingLists.length > 0 && (
            <Tracking lists={trackingLists} />
          )}

          {rest.length > 0 && <Upcoming activities={rest} />}

          {/* A player with no permissions and nothing to answer still needs a
              page that says something. */}
          {upcoming === null && myPending.length === 0 && (
            <p className="text-muted-foreground">{t("dashboard.allClear")}</p>
          )}
        </>
      )}
    </div>
  );
}

// --- What's next -----------------------------------------------------------

/**
 * Kit's matchday hero: an ink panel with the loudest number on the page. The
 * time is that number — it is what someone opening the app before training
 * actually came to check.
 */
function Hero({ activity }: { activity: DashboardActivity }) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  const details = [
    formatTimeRange(activity.startsAt, activity.endsAt, locale),
    activity.location,
  ]
    .filter((part) => part !== null && part !== "")
    .join(SEPARATOR);

  return (
    <Link
      to="/activities/$activityId"
      params={{ activityId: activity.id }}
      className="bg-ink hover:bg-ink-raised flex flex-col gap-6 rounded-xl px-6 py-6 text-white transition-colors duration-[120ms] ease-standard sm:flex-row sm:items-center sm:justify-between sm:px-8"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="kit-overline flex items-center gap-2 text-[var(--text-signal)]">
          <span
            aria-hidden
            className={cn(
              "size-2.5 rounded-full",
              ACTIVITY_COLOUR_DOT[activity.activityTypeColour],
            )}
          />
          {t("dashboard.next")}
          {SEPARATOR}
          {activity.activityTypeName}
        </span>
        <span
          className={cn(
            "font-display text-3xl leading-tight",
            activity.cancelled && "line-through",
          )}
        >
          {activity.title ?? formatDayHeading(new Date(activity.startsAt), locale)}
        </span>
        <span className="text-sm font-semibold text-[var(--neutral-450)]">
          {activity.title === null
            ? details
            : [formatDayHeading(new Date(activity.startsAt), locale), details]
                .filter((part) => part !== "")
                .join(SEPARATOR)}
        </span>
        {activity.cancelled && (
          <span className="mt-1 inline-flex w-fit rounded-pill bg-destructive px-3 py-1 text-xs font-bold text-white uppercase">
            {t("activities.cancelled")}
          </span>
        )}
      </div>

      <div className="flex shrink-0 flex-col sm:items-end">
        <span className="font-display text-[64px] leading-none">
          {formatTime(activity.startsAt, locale)}
        </span>
        {activity.callup !== null && (
          <span className="mt-1 text-sm font-semibold text-[var(--text-signal)]">
            {t("dashboard.squadAccepted", {
              accepted: activity.callup.accepted,
              squad: activity.callup.squad,
            })}
          </span>
        )}
      </div>
    </Link>
  );
}

function EmptyHero() {
  const { t } = useTranslation();
  return (
    <div className="bg-card flex flex-col gap-2 rounded-xl px-6 py-8">
      <p className="kit-overline">{t("dashboard.next")}</p>
      <p className="font-display text-2xl">{t("dashboard.nothingPlanned")}</p>
      <Link to="/activities" className="text-sm font-semibold underline">
        {t("dashboard.toCalendar")}
      </Link>
    </div>
  );
}

function Upcoming({ activities }: { activities: DashboardActivity[] }) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl">{t("dashboard.thenComes")}</h2>
        <Link to="/activities" className="text-sm font-semibold underline">
          {t("dashboard.toCalendar")}
        </Link>
      </div>
      <div className="flex flex-col gap-[11px]">
        {activities.map((activity) => (
          <Link
            key={activity.id}
            to="/activities/$activityId"
            params={{ activityId: activity.id }}
            className="bg-card hover:bg-secondary flex items-center gap-4 rounded-md px-4 py-3 transition-colors duration-[120ms] ease-standard"
          >
            <span
              aria-hidden
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                ACTIVITY_COLOUR_DOT[activity.activityTypeColour],
              )}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn(
                  "truncate font-semibold",
                  activity.cancelled && "line-through",
                )}
              >
                {activity.title ?? activity.activityTypeName}
              </span>
              <span className="text-muted-foreground truncate text-sm">
                {[
                  formatDayHeading(new Date(activity.startsAt), locale),
                  formatTimeRange(activity.startsAt, activity.endsAt, locale),
                  activity.location,
                ]
                  .filter((part) => part !== null && part !== "")
                  .join(SEPARATOR)}
              </span>
            </span>
            {activity.callup !== null && activity.callup.pending > 0 && (
              <span className="shrink-0 rounded-pill border-[1.5px] border-dashed border-[var(--border-dashed)] px-3 py-1 text-xs font-semibold text-muted-foreground">
                {t("dashboard.awaiting", { count: activity.callup.pending })}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

// --- The numbers -----------------------------------------------------------

function StatRow({
  attendance,
  callupsPending,
}: {
  attendance: DashboardAttendance;
  callupsPending: number;
}) {
  const { t } = useTranslation();
  const delta = attendanceDelta(attendance);

  return (
    <div className="grid gap-[14px] sm:grid-cols-3">
      <StatCard
        to="/statistics"
        label={t("dashboard.attendance", { days: attendance.windowDays })}
        value={attendance.rate === null ? "—" : `${attendance.rate}%`}
        footnote={
          attendance.rate === null
            ? t("dashboard.nothingMarked")
            : delta === null
              ? t("dashboard.noComparison")
              : t(delta < 0 ? "dashboard.trendDown" : "dashboard.trendUp", {
                  points: Math.abs(delta),
                })
        }
      />
      {/* Orange means a person has to do something about it. */}
      <StatCard
        to="/callups"
        label={t("dashboard.unanswered")}
        value={String(callupsPending)}
        footnote={
          callupsPending === 0
            ? t("dashboard.everyoneAnswered")
            : t("dashboard.unansweredHint")
        }
        tone={callupsPending > 0 ? "alert" : "ink"}
      />
      <StatCard
        to="/statistics"
        label={t("dashboard.atRisk")}
        value={String(attendance.atRisk)}
        footnote={
          attendance.atRisk === 0
            ? t("dashboard.nobodyAtRisk")
            : t("dashboard.atRiskHint")
        }
        tone={attendance.atRisk > 0 ? "alert" : "ink"}
      />
    </div>
  );
}

/** Kit's stat block: Anton on ink, orange when someone must act. */
function StatCard({
  to,
  label,
  value,
  footnote,
  tone = "ink",
}: {
  to: "/statistics" | "/callups";
  label: string;
  value: string;
  footnote: string;
  tone?: "ink" | "alert";
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex flex-col justify-center gap-1.5 rounded-xl p-6 transition-colors duration-[120ms] ease-standard",
        tone === "alert"
          ? "bg-destructive hover:bg-[var(--orange-800)] text-white"
          : "bg-ink hover:bg-ink-raised text-white",
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
    </Link>
  );
}

// --- What is still outstanding --------------------------------------------

/**
 * Tracking lists (#19) with ticks still missing.
 *
 * Fully-ticked lists never reach here — the backend drops them — because the
 * widget exists to name what is left, and a dashboard that lists finished work
 * buries the rest. Each row is a meter and a plain-words count, never a bare
 * percentage: "6 kvar" is what a coach acts on, "76%" is not.
 */
function Tracking({ lists }: { lists: DashboardTrackingList[] }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl">{t("dashboard.outstanding")}</h2>
        <Link to="/tracking" className="text-sm font-semibold underline">
          {t("dashboard.toTracking")}
        </Link>
      </div>
      <div className="flex flex-col gap-[11px]">
        {lists.map((list) => {
          const remaining = list.total - list.done;
          return (
            <Link
              key={list.definitionId}
              to="/tracking"
              className="bg-card hover:bg-secondary flex items-center gap-4 rounded-md px-4 py-3 transition-colors duration-[120ms] ease-standard"
            >
              <span className="min-w-0 flex-1 truncate font-semibold">
                {list.name}
              </span>
              {/* Kit's thin capsule meter, always paired with a count in words. */}
              <span
                aria-hidden
                className="hidden h-[7px] w-40 shrink-0 overflow-hidden rounded-full bg-[var(--neutral-250)] sm:block"
              >
                <span
                  className="bg-brand block h-full"
                  style={{
                    width: `${list.total === 0 ? 0 : (list.done / list.total) * 100}%`,
                  }}
                />
              </span>
              <span className="text-muted-foreground w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                {list.done}/{list.total}
              </span>
              <span className="text-absent w-24 shrink-0 text-right text-sm font-semibold">
                {t("dashboard.remaining", { count: remaining })}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// --- What I owe an answer to ----------------------------------------------

/**
 * The dashboard answers call-ups in place rather than sending the parent to
 * another page: two taps from opening the app is the whole point of the
 * widget, and the full page (#17) is still one link away for the reasons and
 * the history.
 */
function MyCallups({ callups }: { callups: MyCallup[] }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl">
          {t("dashboard.yourCallups", { count: callups.length })}
        </h2>
        <Link to="/callups" className="text-sm font-semibold underline">
          {t("dashboard.toCallups")}
        </Link>
      </div>
      <div className="flex flex-col gap-[11px]">
        {callups.map((callup) => (
          <PendingCallup
            key={`${callup.activityId}-${callup.memberId}`}
            callup={callup}
          />
        ))}
      </div>
    </div>
  );
}

function PendingCallup({ callup }: { callup: MyCallup }) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const respond = useRespondToCallup();
  // Kept locally so the row does not flicker back to "pending" between the
  // answer landing and the dashboard refetching.
  const [answered, setAnswered] = useState<"accepted" | "declined" | null>(null);

  const answer = (response: "accepted" | "declined") => {
    setAnswered(response);
    respond.mutate({
      teamId: callup.teamId,
      activityId: callup.activityId,
      memberId: callup.memberId,
      response,
    });
  };

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="kit-overline">
            {[
              formatDayHeading(new Date(callup.startsAt), locale),
              formatTimeRange(callup.startsAt, callup.endsAt, locale),
              callup.location,
            ]
              .filter((part) => part !== null && part !== "")
              .join(SEPARATOR)}
          </span>
          <Link
            to="/activities/$activityId"
            params={{ activityId: callup.activityId }}
            className="font-display text-xl hover:underline"
          >
            {callup.title ?? callup.memberName}
          </Link>
          {callup.title !== null && (
            <span className="text-muted-foreground text-sm">
              {callup.memberName}
            </span>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            variant={answered === "accepted" ? "brand" : "outline"}
            disabled={respond.isPending}
            onClick={() => answer("accepted")}
          >
            {t("callupsPage.accept")}
          </Button>
          <Button
            variant={answered === "declined" ? "destructive" : "outline"}
            disabled={respond.isPending}
            onClick={() => answer("declined")}
          >
            {t("callupsPage.decline")}
          </Button>
        </div>
      </div>

      {callup.callupNote !== null && (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">
          {callup.callupNote}
        </p>
      )}

      {respond.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {respond.error.message ?? t("callups.saveError")}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
