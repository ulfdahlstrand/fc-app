/**
 * Onboarding route — shown after first sign-in when the user has no club
 * membership. Creates a club with its first team; the creator becomes Admin.
 */
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ensureMe } from "@/lib/auth";
import {
  ensureMyClubs,
  myClubsQueryOptions,
  onboardingFormSchema,
  type OnboardingFormValues,
  type OnboardingInput,
  selectTeam,
} from "@/lib/clubs";
import { useZodResolver } from "@/lib/form";
import { orpc } from "@/orpc-client";
import { queryClient } from "@/query-client";

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
  const form = useForm<OnboardingFormValues, unknown, OnboardingInput>({
    resolver: useZodResolver(onboardingFormSchema, "onboarding.validation"),
    defaultValues: { clubName: "", teamName: "" },
  });

  const createClub = useMutation({
    mutationFn: (input: OnboardingInput) => orpc.createClub(input),
    onSuccess: async ({ team }) => {
      selectTeam(team.id);
      // fetchQuery, not invalidateQueries: the myClubs query is inactive on
      // this page, so invalidation would only mark the cached [] stale and
      // the "/" guard could reuse it and bounce straight back here.
      await queryClient.fetchQuery(myClubsQueryOptions);
      await navigate({ to: "/" });
    },
  });

  return (
    <div className="mt-12 flex justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{t("onboarding.heading")}</CardTitle>
          <p className="text-muted-foreground text-sm">
            {t("onboarding.description")}
          </p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              className="grid gap-4"
              onSubmit={form.handleSubmit((input) => createClub.mutate(input))}
              noValidate
            >
              {createClub.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{t("onboarding.error")}</AlertDescription>
                </Alert>
              )}

              <FormField
                control={form.control}
                name="clubName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("onboarding.clubName")}</FormLabel>
                    <FormControl>
                      <Input maxLength={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="teamName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("onboarding.teamName")}</FormLabel>
                    <FormControl>
                      <Input maxLength={100} {...field} />
                    </FormControl>
                    <FormDescription>
                      {t("onboarding.teamNameHelp")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                size="lg"
                disabled={createClub.isPending}
              >
                {t("onboarding.submit")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
