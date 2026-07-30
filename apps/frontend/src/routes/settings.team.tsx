/** Team settings — every piece of per-team configuration (ADR-005). */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ActivityTypes } from "@/components/settings/ActivityTypesSection";
import { AttendanceStatuses } from "@/components/settings/AttendanceStatusesSection";
import { MemberFields } from "@/components/settings/MemberFieldsSection";
import { Seasons } from "@/components/settings/SeasonsSection";
import { TrackingLists } from "@/components/settings/TrackingListsSection";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";

export const Route = createFileRoute("/settings/team")({
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

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">{t("settings.team.heading")}</h1>
        <p className="text-muted-foreground">{selected.team.name}</p>
      </div>
      <ActivityTypes teamId={selected.team.id} />
      <AttendanceStatuses teamId={selected.team.id} />
      <Seasons teamId={selected.team.id} />
      <MemberFields teamId={selected.team.id} />
      <TrackingLists teamId={selected.team.id} />
    </div>
  );
}
