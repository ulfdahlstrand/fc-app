/** Onboarding route — shown after first sign-in when the user has no club membership. */
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { ensureMe } from "../lib/auth";
import {
  type CreateClubFormValues,
  type CreateClubInput,
  createClubFormSchema,
  ensureMyClubs,
  myClubsQueryOptions,
  selectTeam,
} from "../lib/clubs";
import { useZodResolver } from "../lib/form";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";

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

  const form = useForm<CreateClubFormValues, unknown, CreateClubInput>({
    resolver: useZodResolver(createClubFormSchema, "onboarding.validation"),
    defaultValues: { clubName: "", teamName: "" },
  });

  const createClub = useMutation({
    mutationFn: (input: CreateClubInput) => orpc.createClub(input),
    onSuccess: async ({ team }) => {
      selectTeam(team.id);
      await queryClient.fetchQuery({ ...myClubsQueryOptions, staleTime: 0 });
      await navigate({ to: "/" });
    },
  });

  return (
    <div className="mt-12 flex flex-col items-center">
      <Card className="w-full max-w-md">
        <CardContent>
          <Form {...form}>
            <form
              className="flex flex-col gap-6"
              onSubmit={form.handleSubmit((input) => createClub.mutate(input))}
              noValidate
            >
              <div>
                <h1 className="font-display text-2xl">
                  {t("onboarding.heading")}
                </h1>
                <p className="mt-1 text-muted-foreground">
                  {t("onboarding.description")}
                </p>
              </div>

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

              <Button type="submit" size="lg" disabled={createClub.isPending}>
                {t("onboarding.submit")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
