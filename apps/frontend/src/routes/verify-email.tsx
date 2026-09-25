/** Confirming an address from a signup link (ADR-024). */
import { useMutation } from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AuthCard } from "@/components/auth/AuthCard";
import { useLinkToken } from "@/components/auth/useLinkToken";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PasswordAuthError,
  isPasswordLoginEnabled,
  verifyEmail,
} from "../lib/password-auth";

export const Route = createFileRoute("/verify-email")({
  beforeLoad: async () => {
    if (!(await isPasswordLoginEnabled())) throw redirect({ to: "/login" });
  },
  component: VerifyEmailPage,
});

/**
 * Confirmation waits for a click rather than firing on load: mail scanners
 * open links to inspect them, and one that also ran this page would otherwise
 * spend the link before its owner got there.
 */
function VerifyEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useLinkToken();

  const verify = useMutation({
    mutationFn: () => verifyEmail(token ?? ""),
    onSuccess: () => navigate({ to: "/" }),
  });

  const errorCode =
    verify.error instanceof PasswordAuthError ? verify.error.code : "failed";

  if (!token || errorCode === "invalid_token") {
    return (
      <AuthCard
        heading={t("verifyEmail.heading")}
        description={t("verifyEmail.invalidLink")}
      >
        <Button asChild>
          <Link to="/register">{t("verifyEmail.registerAgain")}</Link>
        </Button>
        <Button asChild variant="link" size="sm">
          <Link to="/login">{t("passwordAuth.backToLogin")}</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      heading={t("verifyEmail.heading")}
      description={t("verifyEmail.description")}
    >
      {verify.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {t(`passwordAuth.errors.${errorCode}`)}
          </AlertDescription>
        </Alert>
      )}
      <Button
        size="lg"
        disabled={verify.isPending}
        onClick={() => verify.mutate()}
      >
        {t("verifyEmail.submit")}
      </Button>
    </AuthCard>
  );
}
