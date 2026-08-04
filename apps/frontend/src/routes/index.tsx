/** Dashboard (issue #20) — the landing page inside a team context. */
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

/** Kit's matchday hero: an ink panel with the loudest number on the page. */
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
      className="bg-ink hover:bg-ink-raised flex flex-col gap-4 rounded-xl px-5 py-[18px] text-white transition-colors duration-[120ms] ease-standard kit:flex-row kit:items-center kit:justify-between kit:gap-6 kit:px-8 kit:py-6"
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
            "font-display kit-display-md leading-tight",
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

      <div className="flex shrink-0 flex-col kit:items-end">
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
    <div className="bg-card flex flex-col gap-2 rounded-xl px-5 py-[18px] kit:px-6 kit:py-8">
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
            className="bg-card hover:bg-secondary flex items-center gap-4 rounded-lg px-4 py-3 kit:rounded-md transition-colors duration-[120ms] ease-standard"
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
    // "Two stat cards across is the maximum at 390px" — and a third stacks
    // rather than being squeezed into a half-width third slot.
    <div className="grid grid-cols-2 gap-[14px] kit:grid-cols-3 [&>*:nth-child(3)]:col-span-2 kit:[&>*:nth-child(3)]:col-span-1">
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
        // Kit's card padding on a phone is 18px 20px, against 22–30px on the
        // desktop. The radius is untouched — cards stay 22px everywhere.
        "flex flex-col justify-center gap-1.5 rounded-xl px-5 py-[18px] transition-colors duration-[120ms] ease-standard kit:p-6",
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
      {/* Kit's display-lg step: 54px on the desktop, 40px on a phone, where two
          of these sit side by side. */}
      <span className="font-display kit-display-lg leading-none">{value}</span>
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

/** Tracking lists (#19) with ticks still missing. */
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
              // Two fixed 96px columns plus a meter do not fit beside a name at
              // 390px. Rather than clip anything, the counts drop to their own
              // line under the name and keep their full words.
              className="bg-card hover:bg-secondary flex min-h-tap-row flex-col justify-center gap-1 rounded-lg px-4 py-3 kit:flex-row kit:items-center kit:gap-4 kit:rounded-md transition-colors duration-[120ms] ease-standard"
            >
              <span className="min-w-0 flex-1 truncate font-semibold">
                {list.name}
              </span>
              {/* Kit's thin capsule meter, always paired with a count in words. */}
              <span
                aria-hidden
                className="hidden h-[7px] w-40 shrink-0 overflow-hidden rounded-full bg-[var(--neutral-250)] kit:block"
              >
                <span
                  className="bg-brand block h-full"
                  style={{
                    width: `${list.total === 0 ? 0 : (list.done / list.total) * 100}%`,
                  }}
                />
              </span>
              <span className="flex shrink-0 gap-3 kit:contents">
                <span className="text-muted-foreground text-sm font-semibold tabular-nums kit:w-24 kit:shrink-0 kit:text-right">
                  {list.done}/{list.total}
                </span>
                <span className="text-absent text-sm font-semibold kit:w-24 kit:shrink-0 kit:text-right">
                  {t("dashboard.remaining", { count: remaining })}
                </span>
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
    <div className="bg-card flex flex-col gap-3 rounded-xl px-5 py-[18px] kit:px-6 kit:py-5">
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

        {/* Accept and decline carry equal weight, so they split the width
            evenly rather than taking Kit's 1 : 2 save-bar shape. */}
        <div className="grid w-full shrink-0 grid-cols-2 gap-2 kit:flex kit:w-auto">
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
