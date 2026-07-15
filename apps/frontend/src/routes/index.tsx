/**
 * Index route — renders at the "/" path.
 *
 * Placeholder home page. It demonstrates the full stack end-to-end:
 * TanStack Router file-based routing, react-i18next translations, and a
 * typed oRPC call to the backend `health` procedure via TanStack Query.
 */
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { orpc } from "../orpc-client";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => orpc.health({}),
  });

  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        {t("home.heading")}
      </Typography>
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
