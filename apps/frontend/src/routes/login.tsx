/**
 * Login route — the only page a signed-out user sees.
 *
 * Sign-in is a full-page redirect to the backend's /auth/google endpoint;
 * after the OAuth dance the backend sets the session cookie and redirects
 * back to the app root. A failed attempt redirects here with ?error=auth_failed.
 */
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  ensureMe,
  getDevSignInUrl,
  getGoogleSignInUrl,
  isDevLoginEnabled,
} from "../lib/auth";

export interface LoginSearch {
  error?: string;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    return typeof search["error"] === "string"
      ? { error: search["error"] }
      : {};
  },
  beforeLoad: async () => {
    const user = await ensureMe();
    if (user) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const { error } = Route.useSearch();

  return (
    <Stack alignItems="center" sx={{ mt: 8 }}>
      <Paper sx={{ p: 4, maxWidth: 400, width: "100%" }}>
        <Stack spacing={3} alignItems="center">
          <Typography variant="h5" component="h1">
            {t("login.heading")}
          </Typography>
          <Typography color="text.secondary" align="center">
            {t("login.description")}
          </Typography>
          {error !== undefined && (
            <Alert severity="error" sx={{ width: "100%" }}>
              {t("login.error")}
            </Alert>
          )}
          <Button
            variant="contained"
            size="large"
            fullWidth
            href={getGoogleSignInUrl()}
          >
            {t("login.google")}
          </Button>
          {isDevLoginEnabled() && (
            <Button
              variant="outlined"
              color="warning"
              size="small"
              fullWidth
              href={getDevSignInUrl()}
            >
              {t("login.devLogin")}
            </Button>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
