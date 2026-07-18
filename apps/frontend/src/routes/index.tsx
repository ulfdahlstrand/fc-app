/**
 * Index route — renders at the "/" path. Requires sign-in and at least one
 * club membership; redirects to /login or /onboarding otherwise.
 *
 * Placeholder home page until the dashboard (#20). Shows the selected team
 * and verifies the stack with a typed `health` call.
 */
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useSelectedTeam } from "../lib/clubs";
import { takePendingInvite } from "../lib/invitations";
import { orpc } from "../orpc-client";

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
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        {selected ? selected.team.name : t("home.heading")}
      </Typography>
      {selected && (
        <Typography color="text.secondary">{selected.club.name}</Typography>
      )}
      <Typography>{t("home.description")}</Typography>
      {health.isPending ? (
        <Alert severity="info">{t("health.checking")}</Alert>
      ) : health.isError ? (
        <Alert severity="warning">{t("health.error")}</Alert>
      ) : (
        <Alert severity="success">{t("health.ok")}</Alert>
      )}
    </Stack>
  );
}
