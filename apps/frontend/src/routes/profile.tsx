/**
 * Profile route — the signed-in user's own account: identity from the OAuth
 * provider, language preference, and sign-out.
 */
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import i18n, { supportedLanguages } from "../i18n/i18n";
import { ensureMe, logout, meQueryOptions } from "../lib/auth";

export const Route = createFileRoute("/profile")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) {
      throw redirect({ to: "/login" });
    }
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    await navigate({ to: "/login" });
  };

  return (
    <Stack alignItems="center">
      <Paper sx={{ p: 4, maxWidth: 480, width: "100%" }}>
        <Stack spacing={3}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar
              {...(user.imageUrl ? { src: user.imageUrl } : {})}
              alt={user.name}
              sx={{ width: 56, height: 56 }}
            />
            <Stack>
              <Typography variant="h6">{user.name}</Typography>
              <Typography color="text.secondary">{user.email}</Typography>
            </Stack>
          </Stack>

          <Stack spacing={1}>
            <Typography variant="subtitle2">
              {t("profile.language")}
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={i18n.resolvedLanguage}
              onChange={(_event, language: string | null) => {
                if (language) void i18n.changeLanguage(language);
              }}
            >
              {supportedLanguages.map((language) => (
                <ToggleButton key={language} value={language}>
                  {t(`profile.languages.${language}`)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Stack>

          <Button variant="outlined" color="error" onClick={handleLogout}>
            {t("profile.logout")}
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
