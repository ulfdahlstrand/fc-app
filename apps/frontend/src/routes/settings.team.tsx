/**
 * Team settings — every piece of per-team configuration (ADR-005).
 *
 * Seven sections, so the page is a menu and one section rather than a stack of
 * all seven. `lib/team-settings.ts` holds the order and the permission filter;
 * `?section=` holds which one is open, so a section can be linked to and
 * survives a reload.
 *
 * The two shells split the same two pieces differently (DDR-010): the desktop
 * puts the menu in a column beside the section, the phone shows the menu as
 * the page and the section as the page after it, with a way back. That is a
 * swap, not a hidden tree — hence the `useIsPhone` branch rather than CSS.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ActivityTypes } from "@/components/settings/ActivityTypesSection";
import { AttendanceStatuses } from "@/components/settings/AttendanceStatusesSection";
import { DevelopmentMetrics } from "@/components/settings/DevelopmentMetricsSection";
import { MemberAdmin } from "@/components/settings/MemberAdminSection";
import { MemberFields } from "@/components/settings/MemberFieldsSection";
import { Seasons } from "@/components/settings/SeasonsSection";
import { TeamCoaches } from "@/components/settings/TeamCoachesSection";
import { TrackingLists } from "@/components/settings/TrackingListsSection";
import {
  SectionBackLink,
  SectionColumns,
  SectionNav,
} from "@/components/SectionNav";
import { ensureMe } from "../lib/auth";
import { useIsPhone } from "../lib/breakpoint";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import {
  resolveTeamSettingsSection,
  visibleTeamSettingsSections,
} from "../lib/team-settings";

export interface TeamSettingsSearch {
  section?: string;
}

export const Route = createFileRoute("/settings/team")({
  validateSearch: (search: Record<string, unknown>): TeamSettingsSearch => {
    return typeof search["section"] === "string"
      ? { section: search["section"] }
      : {};
  },
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: TeamSettingsPage,
});

function TeamSettingsPage() {
  const { t } = useTranslation();
  const selected = useSelectedTeam();
  const canManage = useHasPermission("settings.team");
  const isPhone = useIsPhone();
  const { section: slug } = Route.useSearch();

  const permissions = selected?.team.permissions ?? [];
  const sections = visibleTeamSettingsSections(permissions);
  const requested = resolveTeamSettingsSection(slug, permissions);
  // No section named — the desktop opens the first one rather than showing an
  // empty column; the phone stays on the menu, which is a screen of its own.
  const active = requested ?? (isPhone ? null : (sections[0] ?? null));

  if (!selected) {
    return (
      <Alert>
        <AlertDescription>{t("members.noTeam")}</AlertDescription>
      </Alert>
    );
  }
  if (!canManage) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("settings.team.forbidden")}</AlertDescription>
      </Alert>
    );
  }

  const navItems = sections.map((section) => ({
    id: section.id,
    label: t(section.labelKey),
    link: { to: "/settings/team", search: { section: section.id } } as const,
  }));
  const navLabel = t("settings.team.sectionsLabel");

  const heading = (
    <div>
      <h1 className="font-display text-4xl">{t("settings.team.heading")}</h1>
      <p className="text-muted-foreground">{selected.team.name}</p>
    </div>
  );

  const body = active && (
    <SectionBody
      id={active.id}
      clubId={selected.club.id}
      teamId={selected.team.id}
    />
  );

  if (isPhone) {
    return (
      <div className="flex flex-col gap-6">
        {active === null ? (
          <>
            {heading}
            <SectionNav
              label={navLabel}
              items={navItems}
              activeId={null}
              variant="list"
            />
          </>
        ) : (
          <>
            {/* The back link replaces the heading: the section's own h2 says
                where you are, and two titles in a row would say it twice. */}
            <SectionBackLink
              link={{ to: "/settings/team" }}
              label={t("settings.team.heading")}
            />
            {body}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {heading}
      <SectionColumns
        nav={
          <SectionNav
            label={navLabel}
            items={navItems}
            activeId={active?.id ?? null}
            variant="column"
          />
        }
      >
        {body}
      </SectionColumns>
    </div>
  );
}

/** One section, chosen by slug. The ids are `lib/team-settings.ts`'s. */
function SectionBody({
  id,
  clubId,
  teamId,
}: {
  id: string;
  clubId: string;
  teamId: string;
}) {
  switch (id) {
    case "coaches":
      return <TeamCoaches clubId={clubId} teamId={teamId} />;
    case "activity-types":
      return <ActivityTypes teamId={teamId} />;
    case "attendance-statuses":
      return <AttendanceStatuses teamId={teamId} />;
    case "seasons":
      return <Seasons teamId={teamId} />;
    case "members":
      return <MemberAdmin teamId={teamId} />;
    case "member-fields":
      return <MemberFields teamId={teamId} />;
    case "tracking":
      return <TrackingLists teamId={teamId} />;
    case "development":
      return <DevelopmentMetrics teamId={teamId} />;
    default:
      return null;
  }
}
