/**
 * Call-ups (issue #17) — two audiences on one page.
 *
 * **Your call-ups** comes first: the questions this user has been asked, for
 * every member they are linked to (#9), across every team. A guardian with
 * two children answers twice, separately.
 *
 * **The team's call-ups** follows for anyone who can see the roster: every
 * upcoming squad with its tally, and a way through to the squad itself.
 *
 * Most people see exactly one of the two. A coach whose own child plays sees
 * both, which is the ordinary case in a grassroots club.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ActivityType, CallupSummary, MyCallup } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ACTIVITY_COLOUR_DOT, useActivityTypes } from "../lib/activity-types";
import { ensureMe } from "../lib/auth";
import {
  groupByActivity,
  useMyCallups,
  useRespondToCallup,
  useTeamCallups,
} from "../lib/callup-responses";
import { onBehalfTitle, RESPONSE_DISC, RESPONSE_GLYPH } from "../lib/callups";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import {
  formatDateLong,
  formatTimeRange,
  SEPARATOR,
  useDateLocale,
} from "../lib/dates";

export const Route = createFileRoute("/callups")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: CallupsPage,
});

function CallupsPage() {
  const { t } = useTranslation();
  const selected = useSelectedTeam();
  const canViewTeam = useHasPermission("members.view");

  const mine = useMyCallups();
  const hasMine = (mine.data?.callups.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="kit-overline">
          {mine.data && mine.data.pending > 0
            ? t("callupsPage.pending", { count: mine.data.pending })
            : t("callupsPage.subtitle")}
        </p>
        <h1 className="font-display text-4xl">{t("callupsPage.heading")}</h1>
      </div>

      {mine.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t("callups.loadError")}</AlertDescription>
        </Alert>
      )}

      {hasMine && <MyCallups callups={mine.data?.callups ?? []} />}

      {selected && canViewTeam && (
        <TeamCallups teamId={selected.team.id} showHeading={hasMine} />
      )}

      {!hasMine && !canViewTeam && !mine.isPending && (
        <p className="text-muted-foreground">{t("callupsPage.empty")}</p>
      )}
    </div>
  );
}

function MyCallups({ callups }: { callups: MyCallup[] }) {
  const { t } = useTranslation();
  const groups = useMemo(() => groupByActivity(callups), [callups]);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-xl">{t("callupsPage.mine")}</h2>
      <div className="flex flex-col gap-[11px]">
        {groups.map((group) => (
          <div
            key={group.activityId}
            className="bg-card flex flex-col gap-4 rounded-xl px-6 py-5"
          >
            <ActivityLine callup={group.entries[0]!} />
            {group.entries.map((entry) => (
              <RespondRow
                key={`${entry.activityId}-${entry.memberId}`}
                callup={entry}
                showName={group.entries.length > 1}
              />
            ))}
            {group.entries[0]?.callupNote && (
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                {group.entries[0].callupNote}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityLine({ callup }: { callup: MyCallup }) {
  const locale = useDateLocale();
  return (
    <div className="flex flex-col gap-0.5">
      <p className="kit-overline">
        {[
          callup.teamName,
          formatDateLong(callup.startsAt, locale),
          formatTimeRange(callup.startsAt, callup.endsAt, locale),
          callup.location,
        ]
          .filter((part) => part !== null && part !== undefined)
          .join(SEPARATOR)}
      </p>
      <Link
        to="/activities/$activityId"
        params={{ activityId: callup.activityId }}
        className="font-display text-2xl hover:underline"
      >
        {callup.title ?? ""}
      </Link>
    </div>
  );
}

/** Accept or decline for one member, with an optional reason. */
function RespondRow({
  callup,
  showName,
}: {
  callup: MyCallup;
  showName: boolean;
}) {
  const { t } = useTranslation();
  const respond = useRespondToCallup();
  const [note, setNote] = useState(callup.responseNote ?? "");

  const answer = (response: "accepted" | "declined") =>
    respond.mutate({
      teamId: callup.teamId,
      activityId: callup.activityId,
      memberId: callup.memberId,
      response,
      note: note.trim() === "" ? null : note.trim(),
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            RESPONSE_DISC[callup.response],
          )}
        >
          {RESPONSE_GLYPH[callup.response]}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {showName && (
            <span className="truncate font-semibold">{callup.memberName}</span>
          )}
          <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-sm">
            {t(`callups.response.${callup.response}`)}
            {/* If a coach put this answer here, say so — and say which coach
                on hover. It is the guardian's question, after all. */}
            {callup.respondedBy?.onBehalf === true && (
              <span
                className="border-b border-dotted border-current"
                title={onBehalfTitle(callup.respondedBy, null, {
                  by: (name) => t("callups.updatedByName", { name }),
                  unknown: t("callups.updatedByUnknown"),
                })}
              >
                {t("callups.updatedByCoach")}
              </span>
            )}
          </span>
        </span>

        <div className="flex gap-2">
          <Button
            variant={callup.response === "accepted" ? "brand" : "outline"}
            disabled={respond.isPending}
            onClick={() => answer("accepted")}
          >
            {t("callupsPage.accept")}
          </Button>
          <Button
            variant={callup.response === "declined" ? "destructive" : "outline"}
            disabled={respond.isPending}
            onClick={() => answer("declined")}
          >
            {t("callupsPage.decline")}
          </Button>
        </div>
      </div>

      {/* Kit's voice is "reasons, not codes" — the note is the reason, and it
          matters most when the answer is no. */}
      {(callup.response === "declined" || note !== "") && (
        <Input
          value={note}
          maxLength={500}
          placeholder={t("callupsPage.notePlaceholder")}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            if ((callup.responseNote ?? "") === note.trim()) return;
            if (callup.response === "pending") return;
            answer(callup.response === "accepted" ? "accepted" : "declined");
          }}
        />
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

function TeamCallups({
  teamId,
  showHeading,
}: {
  teamId: string;
  showHeading: boolean;
}) {
  const { t } = useTranslation();
  const [includePast, setIncludePast] = useState(false);
  const callups = useTeamCallups(teamId, includePast);
  const types = useActivityTypes(teamId, true);

  const typeById = useMemo(() => {
    const map = new Map<string, ActivityType>();
    for (const type of types.data?.activityTypes ?? []) map.set(type.id, type);
    return map;
  }, [types.data]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl">
          {showHeading ? t("callupsPage.team") : t("callupsPage.teamOnly")}
        </h2>
        <Button variant="outline" onClick={() => setIncludePast(!includePast)}>
          {includePast ? t("callupsPage.upcomingOnly") : t("callupsPage.showPast")}
        </Button>
      </div>

      {callups.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : callups.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("callups.loadError")}</AlertDescription>
        </Alert>
      ) : callups.data.callups.length === 0 ? (
        <p className="text-muted-foreground">{t("callupsPage.noneYet")}</p>
      ) : (
        <div className="flex flex-col gap-[11px]">
          {callups.data.callups.map((callup) => (
            <SummaryRow
              key={callup.activityId}
              callup={callup}
              type={typeById.get(callup.activityTypeId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  callup,
  type,
}: {
  callup: CallupSummary;
  type: ActivityType | undefined;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  return (
    <Link
      to="/activities/$activityId"
      params={{ activityId: callup.activityId }}
      className="bg-card hover:bg-secondary flex flex-wrap items-center gap-4 rounded-md px-4 py-3 transition-colors duration-[120ms] ease-standard"
    >
      <span
        aria-hidden
        className={cn(
          "size-3 shrink-0 rounded-full",
          ACTIVITY_COLOUR_DOT[type?.colour ?? "neutral"],
        )}
      />
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            "truncate font-semibold",
            callup.cancelled && "line-through opacity-60",
          )}
        >
          {callup.title ?? type?.name ?? ""}
        </span>
        <span className="text-muted-foreground text-xs">
          {formatDateLong(callup.startsAt, locale)}
          {callup.location === null ? "" : `${SEPARATOR}${callup.location}`}
        </span>
      </span>

      {!callup.published && (
        <span className="bg-secondary text-muted-foreground rounded-pill px-3 py-1 text-xs font-bold tracking-[1px] uppercase">
          {t("callups.draft")}
        </span>
      )}

      {/* The tally, in the same three colours the squad rows use. */}
      <span className="ml-auto flex items-center gap-2 text-sm font-semibold">
        <Tally tone="accepted" value={callup.accepted} />
        <Tally tone="declined" value={callup.declined} />
        <Tally tone="pending" value={callup.pending} />
        <span className="text-muted-foreground ml-1">
          {t("callupsPage.ofSquad", { count: callup.squad })}
        </span>
      </span>
    </Link>
  );
}

function Tally({
  tone,
  value,
}: {
  tone: "accepted" | "declined" | "pending";
  value: number;
}) {
  const { t } = useTranslation();
  return (
    <span
      title={t(`callups.response.${tone}`)}
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-bold",
        RESPONSE_DISC[tone],
      )}
    >
      {RESPONSE_GLYPH[tone]} {value}
    </span>
  );
}
