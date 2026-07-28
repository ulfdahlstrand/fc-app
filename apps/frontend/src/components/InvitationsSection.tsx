/**
 * Invitations manager for the club settings page (issue #6).
 *
 * Lists a club's invitations with status, lets managers create a new invite
 * (role required, optional team scope and email restriction), copy the link,
 * and revoke active ones.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Invitation, InvitationStatus, MyClub } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VariantProps } from "class-variance-authority";
import { myClubsQueryOptions } from "../lib/clubs";
import { useZodResolver } from "../lib/form";
import {
  invitationFormSchema,
  invitationLink,
  useCreateInvitation,
  useInvitations,
  useRevokeInvitation,
  type InvitationFormOutput,
  type InvitationFormValues,
} from "../lib/invitations";
import { useRoles } from "../lib/roles";

/** Sentinel select value for "whole club" — Radix disallows an empty-string item value. */
const CLUB_WIDE = "__club_wide__";

const STATUS_VARIANT: Record<
  InvitationStatus,
  VariantProps<typeof badgeVariants>["variant"]
> = {
  active: "default",
  used: "secondary",
  expired: "outline",
  revoked: "destructive",
};

export function InvitationsSection({ clubId }: { clubId: string }) {
  const { t } = useTranslation();
  const invitations = useInvitations(clubId);
  const revoke = useRevokeInvitation(clubId);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyLink = async (invitation: Invitation) => {
    await navigator.clipboard.writeText(invitationLink(invitation.token));
    setCopiedId(invitation.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-xl">{t("invitations.heading")}</h2>
        <Button onClick={() => setCreating(true)}>{t("invitations.new")}</Button>
      </div>

      {invitations.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : invitations.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("invitations.loadError")}</AlertDescription>
        </Alert>
      ) : invitations.data.invitations.length === 0 ? (
        <p className="text-muted-foreground">{t("invitations.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {invitations.data.invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{invitation.roleName}</p>
                  {invitation.teamName && (
                    <Badge variant="secondary">{invitation.teamName}</Badge>
                  )}
                  <Badge variant={STATUS_VARIANT[invitation.status]}>
                    {t(`invite.status.${invitation.status}`)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {invitation.email ?? t("invitations.anyEmail")}
                </p>
              </div>
              <div className="flex gap-2">
                {invitation.status === "active" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyLink(invitation)}
                    >
                      {copiedId === invitation.id
                        ? t("invitations.copied")
                        : t("invitations.copyLink")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(invitation.id)}
                    >
                      {t("invitations.revoke")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateInvitationDialog
          clubId={clubId}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function CreateInvitationDialog({
  clubId,
  onClose,
}: {
  clubId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const roles = useRoles(clubId);
  const clubs = useQuery(myClubsQueryOptions);
  const createInvitation = useCreateInvitation(clubId);

  const club: MyClub | undefined = clubs.data?.clubs.find(
    (c) => c.id === clubId
  );

  const form = useForm<InvitationFormValues, unknown, InvitationFormOutput>({
    resolver: useZodResolver(invitationFormSchema, "invitations.validation"),
    defaultValues: { roleId: "", teamId: "", email: "" },
  });

  const handleCreate = form.handleSubmit(async (data) => {
    await createInvitation.mutateAsync({
      roleId: data.roleId,
      teamId: data.teamId,
      email: data.email,
    });
    onClose();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("invitations.new")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            id="invitation-form"
            className="grid gap-4"
            onSubmit={handleCreate}
            noValidate
          >
            {createInvitation.isError && (
              <Alert variant="destructive">
                <AlertDescription>{t("invitations.createError")}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="roleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("invitations.role")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(roles.data?.roles ?? []).map((role) => (
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
                  <FormLabel>{t("invitations.team")}</FormLabel>
                  <Select
                    value={field.value === "" ? CLUB_WIDE : field.value}
                    onValueChange={(value) =>
                      field.onChange(value === CLUB_WIDE ? "" : value)
                    }
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={CLUB_WIDE}>
                        {t("invitations.clubWide")}
                      </SelectItem>
                      {(club?.teams ?? []).map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>{t("invitations.teamHelp")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("invitations.email")}</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormDescription>{t("invitations.emailHelp")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            type="submit"
            form="invitation-form"
            disabled={createInvitation.isPending}
          >
            {t("invitations.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
