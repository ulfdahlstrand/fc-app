/**
 * Onboarding route — shown after first sign-in when the user has no club
 * membership. Creates a club with its first team; the creator becomes Admin.
 */
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, selectTeam } from "../lib/clubs";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length > 0) throw redirect({ to: "/" });
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");

  const createClub = useMutation({
    mutationFn: () => orpc.createClub({ clubName, teamName }),
    onSuccess: async ({ team }) => {
      selectTeam(team.id);
      await queryClient.invalidateQueries({ queryKey: ["myClubs"] });
      await navigate({ to: "/" });
    },
  });

  return (
    <Stack alignItems="center" sx={{ mt: 6 }}>
      <Paper sx={{ p: 4, maxWidth: 480, width: "100%" }}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createClub.mutate();
          }}
        >
          <Stack spacing={3}>
            <Typography variant="h5" component="h1">
              {t("onboarding.heading")}
            </Typography>
            <Typography color="text.secondary">
              {t("onboarding.description")}
            </Typography>
            {createClub.isError && (
              <Alert severity="error">{t("onboarding.error")}</Alert>
            )}
            <TextField
              label={t("onboarding.clubName")}
              value={clubName}
              onChange={(event) => setClubName(event.target.value)}
              required
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
            <TextField
              label={t("onboarding.teamName")}
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              required
              helperText={t("onboarding.teamNameHelp")}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={createClub.isPending}
            >
              {t("onboarding.submit")}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
}
