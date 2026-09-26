/** Choosing a new password from a reset link (ADR-024). */
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PASSWORD_MIN_LENGTH } from "@fc-app/contracts";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthTextField } from "@/components/auth/AuthTextField";
import { useLinkToken } from "@/components/auth/useLinkToken";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useZodResolver } from "../lib/form";
import {
  PasswordAuthError,
  type ResetFormOutput,
  type ResetFormValues,
  resetFormSchema,
  resetPassword,
  isPasswordSignupEnabled,
} from "../lib/password-auth";

export const Route = createFileRoute("/reset-password")({
  beforeLoad: async () => {
    if (!(await isPasswordSignupEnabled())) throw redirect({ to: "/login" });
  },
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useLinkToken();

  const form = useForm<ResetFormValues, unknown, ResetFormOutput>({
    resolver: useZodResolver(resetFormSchema, "passwordAuth.validation"),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const reset = useMutation({
    mutationFn: ({ password }: ResetFormOutput) =>
      resetPassword(token ?? "", password),
    onSuccess: () => navigate({ to: "/" }),
  });

  const errorCode =
    reset.error instanceof PasswordAuthError ? reset.error.code : "failed";

  if (!token || errorCode === "invalid_token") {
    return (
      <AuthCard
        heading={t("resetPassword.heading")}
        description={t("resetPassword.invalidLink")}
      >
        <Button asChild>
          <Link to="/forgot-password">{t("resetPassword.requestNew")}</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      heading={t("resetPassword.heading")}
      description={t("resetPassword.description")}
    >
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((input) => reset.mutate(input))}
          noValidate
        >
          {reset.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {t(`passwordAuth.errors.${errorCode}`)}
              </AlertDescription>
            </Alert>
          )}

          <AuthTextField
            control={form.control}
            name="password"
            type="password"
            autoComplete="new-password"
            label={t("resetPassword.newPassword")}
            description={t("passwordAuth.passwordHelp", {
              min: PASSWORD_MIN_LENGTH,
            })}
          />
          <AuthTextField
            control={form.control}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            label={t("passwordAuth.confirmPassword")}
          />

          <Button type="submit" size="lg" disabled={reset.isPending}>
            {t("resetPassword.submit")}
          </Button>
        </form>
      </Form>
    </AuthCard>
  );
}
