/**
 * Index route — renders at the "/" path. Requires sign-in and at least one
 * club membership; redirects to /login or /onboarding otherwise.
 *
 * Placeholder home page until the dashboard (#20). Shows the selected team
 * and verifies the stack with a typed `health` call.
 */
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ensureMe } from "@/lib/auth";
import { ensureMyClubs, useSelectedTeam } from "@/lib/clubs";
import { takePendingInvite } from "@/lib/invitations";
import { orpc } from "@/orpc-client";

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

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => orpc.health({}),
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold tracking-tight">
        {selected ? selected.team.name : t("home.heading")}
      </h1>
      {selected && <p className="text-muted-foreground">{selected.club.name}</p>}
      <p>{t("home.description")}</p>
      {health.isPending ? (
        <Alert>
          <Loader2 className="animate-spin" />
          <AlertDescription>{t("health.checking")}</AlertDescription>
        </Alert>
      ) : health.isError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{t("health.error")}</AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <CircleCheck className="text-green-600 dark:text-green-500" />
          <AlertDescription>{t("health.ok")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
