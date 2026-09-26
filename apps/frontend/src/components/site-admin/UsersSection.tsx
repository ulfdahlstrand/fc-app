/**
 * Every account in the installation, and the one thing a site admin can do to
 * one of them: replace its password (ADR-026).
 *
 * The list is searched rather than paged, because the question it answers is
 * always about one person — "which of these is the Anna who cannot get in?" —
 * and the clubs and teams beside each address are what tells two Annas apart.
 *
 * Reset is offered on an account that already has a password, and activation —
 * a first password — on one that has never been used (ADR-027). A Google-only
 * account's owner proved that address to Google, and giving it a password here
 * would hand the account to whoever typed it (ADR-024), so those rows say why
 * their button is off instead of hiding it — an admin looking for the button
 * needs the reason, not a missing control.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { SiteAdminUser } from "@fc-app/contracts";
import { PASSWORD_MIN_LENGTH } from "@fc-app/contracts";
import { SuggestPasswordButton } from "@/components/site-admin/SuggestPasswordButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { formatDateLong, useDateLocale } from "@/lib/dates";
import { useZodResolver } from "@/lib/form";
import { suggestPassword } from "@/lib/password-suggest";
import {
  setPasswordErrorKey,
  setPasswordFormSchema,
  useSetPassword,
  useSiteAdminUsers,
  type SetPasswordFormValues,
} from "@/lib/site-admin";

export function SiteAdminUsers() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const users = useSiteAdminUsers(search);
  const [target, setTarget] = useState<SiteAdminUser | null>(null);

  return (
    <div>
      <div className="mb-1">
        <h2 className="font-display text-xl">{t("siteAdmin.users")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("siteAdmin.usersHelp")}
        </p>
      </div>

      <div className="mt-3 mb-3 max-w-sm">
        <Label htmlFor="user-search">{t("siteAdmin.search")}</Label>
        <Input
          id="user-search"
          className="mt-1"
          type="search"
          autoComplete="off"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {users.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : users.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("siteAdmin.errors.usersFailed")}</AlertDescription>
        </Alert>
      ) : users.data.users.length === 0 ? (
        <p className="text-muted-foreground">{t("siteAdmin.usersEmpty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {users.data.users.map((user) => (
            <UserRow key={user.id} user={user} onReset={setTarget} />
          ))}
        </div>
      )}

      {users.data?.truncated && (
        <p className="text-muted-foreground mt-3 text-sm">
          {t("siteAdmin.usersTruncated", { shown: users.data.users.length })}
        </p>
      )}

      {target && (
        <SetPasswordDialog
          // A new target starts a new form, with a suggestion of its own.
          key={target.id}
          user={target}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}

function UserRow({
  user,
  onReset,
}: {
  user: SiteAdminUser;
  onReset: (user: SiteAdminUser) => void;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  const googleOnly = user.hasGoogle && !user.hasPassword;
  const activates = !user.hasGoogle && !user.hasPassword;

  const places = user.memberships.map((membership) =>
    membership.teamName === null
      ? `${membership.clubName} (${t("siteAdmin.clubWide")}) · ${membership.roleName}`
      : `${membership.clubName} / ${membership.teamName} · ${membership.roleName}`,
  );

  return (
    <div className="bg-card flex flex-wrap items-start justify-between gap-3 rounded-md p-3">
      <div className="min-w-0">
        <p className="font-medium">{user.name}</p>
        <p className="text-muted-foreground text-sm break-all">{user.email}</p>

        <div className="mt-1 flex flex-wrap items-center gap-1">
          {user.hasPassword && (
            <Badge variant="secondary">{t("siteAdmin.signsInWithPassword")}</Badge>
          )}
          {user.hasGoogle && (
            <Badge variant="secondary">{t("siteAdmin.signsInWithGoogle")}</Badge>
          )}
          {/* Neither: an account someone else created that has never been
              used — it gets in once it is activated below. */}
          {!user.hasPassword && !user.hasGoogle && (
            <Badge variant="outline">{t("siteAdmin.signsInWithNothing")}</Badge>
          )}
          {user.isSiteAdmin && <Badge>{t("siteAdmin.isSiteAdmin")}</Badge>}
        </div>

        <p className="text-muted-foreground mt-1 text-sm">
          {places.length === 0
            ? t("siteAdmin.noMemberships")
            : places.join(" · ")}
        </p>
        <p className="text-muted-foreground text-sm">
          {t("siteAdmin.createdOn", {
            date: formatDateLong(user.createdAt, locale),
          })}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={googleOnly}
          onClick={() => onReset(user)}
        >
          {t(activates ? "siteAdmin.activate" : "siteAdmin.setPassword")}
        </Button>
        {googleOnly && (
          <p className="text-muted-foreground max-w-56 text-right text-xs">
            {t("siteAdmin.setPasswordUnavailableGoogle")}
          </p>
        )}
      </div>
    </div>
  );
}

function SetPasswordDialog({
  user,
  onClose,
}: {
  user: SiteAdminUser;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const setPassword = useSetPassword();
  // Neither a password nor Google: the first password is what activates it.
  const activates = !user.hasPassword && !user.hasGoogle;
  const [done, setDone] = useState<{ password: string; sessions: number } | null>(
    null,
  );

  const form = useForm<SetPasswordFormValues>({
    resolver: useZodResolver(setPasswordFormSchema, "siteAdmin.validation"),
    // Opening the dialog is itself the suggestion: the common case is an admin
    // who wants a sound password, not a particular one.
    defaultValues: { password: suggestPassword() },
  });

  const submit = form.handleSubmit(async (values) => {
    const result = await setPassword.mutateAsync({
      userId: user.id,
      password: values.password,
    });
    setDone({ password: values.password, sessions: result.sessionsEnded });
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(activates ? "siteAdmin.activateFor" : "siteAdmin.setPasswordFor", {
              name: user.name,
            })}
          </DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="grid gap-4">
            <Alert>
              <AlertDescription>
                {t(activates ? "siteAdmin.activated" : "siteAdmin.passwordSet", {
                  password: done.password,
                })}
              </AlertDescription>
            </Alert>
            {/* A never-used account had no sessions to end. */}
            {!activates && (
              <p className="text-muted-foreground text-sm">
                {t("siteAdmin.sessionsEnded", { count: done.sessions })}
              </p>
            )}
            <DialogFooter>
              <Button onClick={onClose}>{t("common.close")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                // Shown from the mutation's state; never an unhandled rejection.
                submit(event).catch(() => undefined);
              }}
              noValidate
            >
              {setPassword.isError && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {t(setPasswordErrorKey(setPassword.error))}
                  </AlertDescription>
                </Alert>
              )}

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("siteAdmin.newPassword")}</FormLabel>
                    <FormControl>
                      {/* Visible on purpose: it is typed to be handed on, and
                          the browser must not save it as the admin's own. */}
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
                      {t("siteAdmin.newPasswordHelp", {
                        min: PASSWORD_MIN_LENGTH,
                      })}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  {t("common.close")}
                </Button>
                <Button type="submit" disabled={setPassword.isPending}>
                  {t(activates ? "siteAdmin.activate" : "siteAdmin.setPassword")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
