/** Creating an account with email and password (ADR-024). */
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PASSWORD_MIN_LENGTH } from "@fc-app/contracts";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthTextField } from "@/components/auth/AuthTextField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { ensureMe } from "../lib/auth";
import { useZodResolver } from "../lib/form";
import {
  PasswordAuthError,
  type RegisterFormOutput,
  type RegisterFormValues,
  registerFormSchema,
  registerWithPassword,
  isPasswordLoginEnabled,
} from "../lib/password-auth";

export const Route = createFileRoute("/register")({
  beforeLoad: async () => {
    if (await ensureMe()) throw redirect({ to: "/" });
    if (!(await isPasswordLoginEnabled())) throw redirect({ to: "/login" });
  },
  component: RegisterPage,
});

function RegisterPage() {
  const { t } = useTranslation();

  const form = useForm<RegisterFormValues, unknown, RegisterFormOutput>({
    resolver: useZodResolver(registerFormSchema, "passwordAuth.validation"),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const registration = useMutation({ mutationFn: registerWithPassword });

  if (registration.isSuccess) {
    // The same answer whether or not the address already had an account —
    // the mail itself says which.
    return (
      <AuthCard
        heading={t("register.sentHeading")}
        description={t("register.sent", {
          email: registration.variables.email,
        })}
      >
        <Button asChild variant="outline">
          <Link to="/login">{t("passwordAuth.backToLogin")}</Link>
        </Button>
      </AuthCard>
    );
  }

  const errorCode =
    registration.error instanceof PasswordAuthError
      ? registration.error.code
      : "failed";

  return (
    <AuthCard
      heading={t("register.heading")}
      description={t("register.description")}
    >
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((input) => registration.mutate(input))}
          noValidate
        >
          {registration.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {t(`passwordAuth.errors.${errorCode}`)}
              </AlertDescription>
            </Alert>
          )}

          <AuthTextField
            control={form.control}
            name="name"
            autoComplete="name"
            label={t("register.name")}
          />
          <AuthTextField
            control={form.control}
            name="email"
            type="email"
            autoComplete="email"
            label={t("passwordAuth.email")}
          />
          <AuthTextField
            control={form.control}
            name="password"
            type="password"
            autoComplete="new-password"
            label={t("passwordAuth.password")}
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

          <Button type="submit" size="lg" disabled={registration.isPending}>
            {t("register.submit")}
          </Button>
        </form>
      </Form>

      <Button asChild variant="link" size="sm">
        <Link to="/login">{t("register.haveAccount")}</Link>
      </Button>
    </AuthCard>
  );
}
