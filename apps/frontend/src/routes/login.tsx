/**
 * Login route — the only page a signed-out user sees.
 *
 * Sign-in is a full-page redirect to the backend's /auth/google endpoint;
 * after the OAuth dance the backend sets the session cookie and redirects
 * back to the app root. A failed attempt redirects here with ?error=auth_failed.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="mt-16 flex flex-col items-center">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-6">
          <h1 className="text-xl font-semibold">{t("login.heading")}</h1>
          <p className="text-center text-muted-foreground">
            {t("login.description")}
          </p>
          {error !== undefined && (
            <Alert variant="destructive" className="w-full">
              <AlertDescription>{t("login.error")}</AlertDescription>
            </Alert>
          )}
          <Button asChild size="lg" className="w-full">
            <a href={getGoogleSignInUrl()}>{t("login.google")}</a>
          </Button>
          {isDevLoginEnabled() && (
            <Button asChild variant="outline" size="sm" className="w-full">
              <a href={getDevSignInUrl()}>{t("login.devLogin")}</a>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
