/** Login route — the only page a signed-out user sees. */
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthTextField } from "@/components/auth/AuthTextField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  ensureMe,
  getDevSignInUrl,
  getGoogleSignInUrl,
  isDevLoginEnabled,
} from "../lib/auth";
import { useZodResolver } from "../lib/form";
import {
  type LoginFormOutput,
  type LoginFormValues,
  PasswordAuthError,
  authOptionsQueryOptions,
  isPasswordSignupEnabled,
  loginFormSchema,
  loginWithPassword,
} from "../lib/password-auth";

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
    // Loaded before render so the links do not pop in. If the API cannot
    // say, they stay hidden — the page must still work.
    await isPasswordSignupEnabled().catch(() => false);
  },
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const { error } = Route.useSearch();
  const navigate = useNavigate();
  // Signing in with a password needs no mail and is always offered — a site
  // admin may have made the account (ADR-025). Registering and resetting do,
  // so their links wait until the API can send it, and stay hidden while
  // that is unknown (ADR-024).
  const passwordSignup = useQuery(authOptionsQueryOptions).data?.passwordSignup;

  const form = useForm<LoginFormValues, unknown, LoginFormOutput>({
    resolver: useZodResolver(loginFormSchema, "login.validation"),
    defaultValues: { email: "", password: "" },
  });

  const signIn = useMutation({
    mutationFn: loginWithPassword,
    // "/" picks up a pending invitation, as it does after Google.
    onSuccess: () => navigate({ to: "/" }),
    onError: () => form.resetField("password"),
  });

  const errorCode =
    signIn.error instanceof PasswordAuthError ? signIn.error.code : "failed";

  return (
    <AuthCard heading={t("login.heading")} description={t("login.description")}>
      {error !== undefined && (
        <Alert variant="destructive">
          <AlertDescription>{t("login.error")}</AlertDescription>
        </Alert>
      )}

      <Button asChild size="lg" className="w-full">
        <a href={getGoogleSignInUrl()}>{t("login.google")}</a>
      </Button>

      <div
        className="flex items-center gap-3 text-sm text-muted-foreground"
        role="separator"
      >
        <span className="h-px flex-1 bg-border" />
        {t("login.or")}
        <span className="h-px flex-1 bg-border" />
      </div>

      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((input) => signIn.mutate(input))}
          noValidate
        >
          {signIn.isError && (
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
          <AuthTextField
            control={form.control}
            name="password"
            type="password"
            autoComplete="current-password"
            label={t("passwordAuth.password")}
          />

          <Button
            type="submit"
            variant="outline"
            size="lg"
            disabled={signIn.isPending}
          >
            {t("login.withPassword")}
          </Button>
        </form>
      </Form>

      {passwordSignup && (
        <div className="flex flex-col items-center gap-1 text-sm">
          <Button asChild variant="link" size="sm">
            <Link to="/forgot-password">{t("login.forgotPassword")}</Link>
          </Button>
          <Button asChild variant="link" size="sm">
            <Link to="/register">{t("login.createAccount")}</Link>
          </Button>
        </div>
      )}

      {isDevLoginEnabled() && (
        <Button asChild variant="outline" size="sm" className="w-full">
          <a href={getDevSignInUrl()}>{t("login.devLogin")}</a>
        </Button>
      )}
    </AuthCard>
  );
}
