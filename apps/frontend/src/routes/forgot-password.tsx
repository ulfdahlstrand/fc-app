/** Asking for a password reset link (ADR-024). */
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthTextField } from "@/components/auth/AuthTextField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { ensureMe } from "../lib/auth";
import { useZodResolver } from "../lib/form";
import {
  type ForgotFormOutput,
  type ForgotFormValues,
  PasswordAuthError,
  forgotFormSchema,
  requestPasswordReset,
  isPasswordLoginEnabled,
} from "../lib/password-auth";

export const Route = createFileRoute("/forgot-password")({
  beforeLoad: async () => {
    if (await ensureMe()) throw redirect({ to: "/" });
    if (!(await isPasswordLoginEnabled())) throw redirect({ to: "/login" });
  },
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useTranslation();

  const form = useForm<ForgotFormValues, unknown, ForgotFormOutput>({
    resolver: useZodResolver(forgotFormSchema, "passwordAuth.validation"),
    defaultValues: { email: "" },
  });

  const request = useMutation({ mutationFn: requestPasswordReset });

  if (request.isSuccess) {
    // Worded so it is true whether or not the address has an account.
    return (
      <AuthCard
        heading={t("forgotPassword.sentHeading")}
        description={t("forgotPassword.sent", {
          email: request.variables.email,
        })}
      >
        <Button asChild variant="outline">
          <Link to="/login">{t("passwordAuth.backToLogin")}</Link>
        </Button>
      </AuthCard>
    );
  }

  const errorCode =
    request.error instanceof PasswordAuthError ? request.error.code : "failed";

  return (
    <AuthCard
      heading={t("forgotPassword.heading")}
      description={t("forgotPassword.description")}
    >
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((input) => request.mutate(input))}
          noValidate
        >
          {request.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {t(`passwordAuth.errors.${errorCode}`)}
              </AlertDescription>
            </Alert>
          )}

          <AuthTextField
            control={form.control}
            name="email"
            type="email"
            autoComplete="username"
            label={t("passwordAuth.email")}
          />

          <Button type="submit" size="lg" disabled={request.isPending}>
            {t("forgotPassword.submit")}
          </Button>
        </form>
      </Form>

      <Button asChild variant="link" size="sm">
        <Link to="/login">{t("passwordAuth.backToLogin")}</Link>
      </Button>
    </AuthCard>
  );
}
