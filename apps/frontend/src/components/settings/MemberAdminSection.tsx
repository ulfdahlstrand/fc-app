/**
 * The two roster actions that are administration rather than reading: adding a
 * member by hand, and inviting the guardians an import brought in.
 *
 * Both used to sit on `/members`, at the top, on every visit. Neither belongs
 * there. Adding one member by hand is what you do on a team's first day or when
 * someone joins mid-season — a handful of times a year against a page opened
 * daily — and the invitation line was a banner that pushed the roster down the
 * screen to say something only an admin could act on.
 *
 * Moving them here also lets the invitation line say the other half of the
 * answer: with nobody left to invite it says so, instead of vanishing and
 * leaving "have they all been invited?" unanswered.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { MemberFormDialog } from "@/components/MemberFormDialog";
import { useHasPermission } from "@/lib/clubs";
import {
  useInviteMemberContacts,
  usePendingContactInvites,
} from "@/lib/guardians";
import { useCreateMember } from "@/lib/members";

export function MemberAdmin({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const canManage = useHasPermission("members.manage");
  // Inviting anyone into the club is an admin's call, however narrow the
  // invitation is — so a coach sees this section with only the add button.
  const canInvite = useHasPermission("settings.club");
  const [creating, setCreating] = useState(false);
  const createMember = useCreateMember(teamId);
  const pendingInvites = usePendingContactInvites(teamId, canInvite);
  const inviteContacts = useInviteMemberContacts(teamId);
  const invitable = pendingInvites.data?.invitable ?? 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-xl">{t("settings.team.members")}</h2>
        {canManage && (
          <Button onClick={() => setCreating(true)}>{t("members.add")}</Button>
        )}
      </div>
      <p className="text-muted-foreground mb-3 text-sm">
        {t("settings.team.membersHint")}
      </p>

      {/* Only once the count is known: a row that appears saying "everyone has
          an account" and then corrects itself to "56 do not" is worse than a
          row that waits. */}
      {canInvite && pendingInvites.isSuccess && (
        <div className="bg-card flex flex-wrap items-center justify-between gap-2 rounded-md p-3">
          <p className={invitable === 0 ? "text-muted-foreground" : undefined}>
            {invitable === 0
              ? t("guardians.allInvited")
              : t("guardians.pendingInvites", { count: invitable })}
          </p>
          {invitable > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={inviteContacts.isPending}
              onClick={() => inviteContacts.mutate()}
            >
              {t("guardians.inviteAll")}
            </Button>
          )}
        </div>
      )}

      {inviteContacts.data && (
        <Alert className="mt-3">
          <AlertDescription>
            {t("guardians.invitesSent", { count: inviteContacts.data.invited })}
          </AlertDescription>
        </Alert>
      )}

      {inviteContacts.isError && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{t("guardians.inviteError")}</AlertDescription>
        </Alert>
      )}

      {creating && (
        <MemberFormDialog
          saving={createMember.isPending}
          error={createMember.error}
          onSave={async (input) => {
            await createMember.mutateAsync(input);
            setCreating(false);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
