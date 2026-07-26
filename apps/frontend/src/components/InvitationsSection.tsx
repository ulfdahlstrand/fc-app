/**
 * Invitations manager for the club settings page (issue #6).
 *
 * Lists a club's invitations with status, lets managers create a new invite
 * (role required, optional team scope and email restriction), copy the link,
 * and revoke active ones.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Invitation, InvitationStatus, MyClub } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { myClubsQueryOptions } from "@/lib/clubs";
import {
  invitationLink,
  useCreateInvitation,
  useInvitations,
  useRevokeInvitation,
} from "@/lib/invitations";
import { useRoles } from "@/lib/roles";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const STATUS_VARIANT: Record<InvitationStatus, BadgeVariant> = {
  active: "default",
  used: "secondary",
  expired: "outline",
  revoked: "destructive",
};

/** Radix Select forbids an empty-string value, so the "club-wide" option uses this sentinel. */
const CLUB_WIDE = "__club_wide__";

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
        <h2 className="text-lg font-semibold">{t("invitations.heading")}</h2>
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
            <Card key={invitation.id} className="py-4">
              <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{invitation.roleName}</span>
                    {invitation.teamName && (
                      <Badge variant="secondary">{invitation.teamName}</Badge>
                    )}
                    <Badge variant={STATUS_VARIANT[invitation.status]}>
                      {t(`invite.status.${invitation.status}`)}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {invitation.email ?? t("invitations.anyEmail")}
                  </p>
                </div>
                {invitation.status === "active" && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyLink(invitation)}
                    >
                      {copiedId === invitation.id
                        ? t("invitations.copied")
                        : t("invitations.copyLink")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(invitation.id)}
                    >
                      {t("invitations.revoke")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
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

  const [roleId, setRoleId] = useState("");
  const [teamId, setTeamId] = useState<string>("");
  const [email, setEmail] = useState("");

  const handleCreate = async () => {
    await createInvitation.mutateAsync({
      roleId,
      teamId: teamId === "" ? null : teamId,
      email: email.trim() === "" ? null : email.trim(),
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("invitations.new")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          {createInvitation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {t("invitations.createError")}
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="invite-role">{t("invitations.role")}</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(roles.data?.roles ?? []).map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-team">{t("invitations.team")}</Label>
            <Select
              value={teamId || CLUB_WIDE}
              onValueChange={(value) =>
                setTeamId(value === CLUB_WIDE ? "" : value)
              }
            >
              <SelectTrigger id="invite-team" className="w-full">
                <SelectValue />
              </SelectTrigger>
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
            <p className="text-muted-foreground text-sm">
              {t("invitations.teamHelp")}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-email">{t("invitations.email")}</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <p className="text-muted-foreground text-sm">
              {t("invitations.emailHelp")}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={roleId === "" || createInvitation.isPending}
          >
            {t("invitations.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
