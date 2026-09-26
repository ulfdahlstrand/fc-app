/**
 * Site administration (ADR-025, ADR-026) — for whoever runs the installation,
 * reached from the user menu. Creates an account with an address and password
 * chosen for the person, and places it in the club being looked at, so someone
 * without Google can sign in without the app having to send mail; below that,
 * every account in the installation, with the password of one of them.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PASSWORD_MIN_LENGTH } from "@fc-app/contracts";
import { SiteAdminUsers } from "@/components/site-admin/UsersSection";
import { SuggestPasswordButton } from "@/components/site-admin/SuggestPasswordButton";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ensureMe } from "../lib/auth";
import { useSelectedTeam } from "../lib/clubs";
import { useZodResolver } from "../lib/form";
import {
  CLUB_WIDE,
  createUserErrorKey,
  createUserFormSchema,
  useCreateUser,
  useSiteAdminClub,
  type CreateUserFormOutput,
  type CreateUserFormValues,
} from "../lib/site-admin";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    // The API refuses everyone else anyway; this only spares them the page.
    if (!user.isSiteAdmin) throw redirect({ to: "/" });
  },
  component: SiteAdminPage,
});

function SiteAdminPage() {
  const { t } = useTranslation();
  const selected = useSelectedTeam();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl">{t("siteAdmin.heading")}</h1>
        <p className="text-muted-foreground">{t("siteAdmin.description")}</p>
      </div>

      {selected ? (
        <CreateUserSection
          // A new club starts a new form: its roles and teams are different.
          key={selected.club.id}
          clubId={selected.club.id}
          clubName={selected.club.name}
          defaultTeamId={selected.team.id}
        />
      ) : (
        // Only creating needs a club; the account list spans the installation,
        // so it stays below this either way.
        <Alert>
          <AlertDescription>{t("siteAdmin.noClub")}</AlertDescription>
        </Alert>
      )}

      <SiteAdminUsers />
    </div>
  );
}

function CreateUserSection({
  clubId,
  clubName,
  defaultTeamId,
}: {
  clubId: string;
  clubName: string;
  defaultTeamId: string;
}) {
  const { t } = useTranslation();
  const club = useSiteAdminClub(clubId);
  const createUser = useCreateUser(clubId);
  const [created, setCreated] = useState<string | null>(null);

  const form = useForm<CreateUserFormValues, unknown, CreateUserFormOutput>({
    resolver: useZodResolver(createUserFormSchema, "siteAdmin.validation"),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      roleId: "",
      teamId: defaultTeamId,
    },
  });

  const handleCreate = form.handleSubmit(async (input) => {
    setCreated(null);
    await createUser.mutateAsync(input);
    setCreated(input.email);
    form.reset();
  });

  return (
    <div>
      <div className="mb-2">
        <h2 className="font-display text-xl">{t("siteAdmin.createUser")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("siteAdmin.createUserHelp", { club: clubName })}
        </p>
      </div>

      <Card className="max-w-xl">
        <CardContent>
          <Form {...form}>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                // A rejected create is shown from the mutation's state; the
                // promise must not escape as an unhandled rejection.
                handleCreate(event).catch(() => undefined);
              }}
              noValidate
            >
              {created && (
                <Alert>
                  <AlertDescription>
                    {t("siteAdmin.created", { email: created })}
                  </AlertDescription>
                </Alert>
              )}
              {createUser.isError && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {t(createUserErrorKey(createUser.error))}
                  </AlertDescription>
                </Alert>
              )}

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("siteAdmin.name")}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("siteAdmin.email")}</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("siteAdmin.password")}</FormLabel>
                    <FormControl>
                      {/* Visible on purpose: it is typed to be handed on,
                          and the browser must not save it as the admin's. */}
                      <Input type="text" autoComplete="off" {...field} />
                    </FormControl>
                    <SuggestPasswordButton
                      value={field.value}
                      onSuggest={(password) =>
                        form.setValue("password", password, {
                          shouldValidate: true,
                        })
                      }
                    />
                    <FormDescription>
                      {t("siteAdmin.passwordHelp", {
                        min: PASSWORD_MIN_LENGTH,
                      })}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="roleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("siteAdmin.role")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("siteAdmin.chooseRole")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(club.data?.roles ?? []).map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="teamId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("siteAdmin.team")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={CLUB_WIDE}>
                          {t("siteAdmin.clubWide")}
                        </SelectItem>
                        {(club.data?.teams ?? []).map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <Button type="submit" disabled={createUser.isPending}>
                  {t("siteAdmin.create")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
