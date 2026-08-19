/**
 * Who coaches this team (#98).
 *
 * Two ways in, because a club has two kinds of coach: the one who already has
 * an account somewhere in the club (picked from a list, effective immediately)
 * and the one who has never signed in (invited by address, effective when they
 * accept). The waiting invitations are shown next to the coaches for that
 * reason — half the answer to "is she in yet?" lives in each list.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useZodResolver } from "@/lib/form";
import {
  coachByEmailFormSchema,
  sortCandidates,
  sortMemberCandidates,
  useAddCoachByEmail,
  useAddMemberAsCoach,
  useAddTeamCoach,
  useRemoveTeamCoach,
  useRevokeCoachInvitation,
  useTeamCoaches,
  type CoachByEmailFormOutput,
  type CoachByEmailFormValues,
} from "@/lib/coaches";
import { invitationLink } from "@/lib/invitations";
import type { Invitation, MemberCoachCandidate } from "@fc-app/contracts";

/** Which list a picked row came from — see the note on `selected` below. */
const MEMBER_PREFIX = "member:";
const USER_PREFIX = "user:";

export function TeamCoaches({
  clubId,
  teamId,
}: {
  clubId: string;
  teamId: string;
}) {
  const { t } = useTranslation();
  const coaches = useTeamCoaches(teamId);
  const removeCoach = useRemoveTeamCoach(teamId);
  const revokeInvitation = useRevokeCoachInvitation(clubId, teamId);
  const [adding, setAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyLink = async (invitation: Invitation) => {
    await navigator.clipboard.writeText(invitationLink(invitation.token));
    setCopiedId(invitation.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-xl">{t("settings.team.coaches")}</h2>
        <Button onClick={() => setAdding(true)}>
          {t("settings.team.addCoach")}
        </Button>
      </div>
      <p className="text-muted-foreground mb-3 text-sm">
        {t("settings.team.coachesHint")}
      </p>

      {coaches.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : coaches.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("settings.team.loadError")}</AlertDescription>
        </Alert>
      ) : coaches.data.coaches.length === 0 ? (
        <p className="text-muted-foreground">
          {t("settings.team.coachesEmpty")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {coaches.data.coaches.map((coach) => (
            <div
              key={coach.userId}
              className="bg-card flex flex-wrap items-center justify-between gap-2 rounded-md p-3"
            >
              <div>
                <p className="font-medium">{coach.name}</p>
                <p className="text-muted-foreground text-sm">{coach.email}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={removeCoach.isPending}
                onClick={() => removeCoach.mutate(coach.userId)}
              >
                {t("settings.team.removeCoach")}
              </Button>
            </div>
          ))}
        </div>
      )}

      {removeCoach.isError && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>
            {t("settings.team.removeCoachError")}
          </AlertDescription>
        </Alert>
      )}

      {(coaches.data?.invitations.length ?? 0) > 0 && (
        <div className="mt-4">
          <h3 className="text-muted-foreground mb-2 text-sm">
            {t("settings.team.coachInvitesHeading")}
          </h3>
          <div className="flex flex-col gap-2">
            {coaches.data?.invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="bg-card flex flex-wrap items-center justify-between gap-2 rounded-md p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{invitation.email}</p>
                  <Badge variant="outline">
                    {t("settings.team.coachInvitePending")}
                  </Badge>
                </div>
                <div className="flex gap-2">
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
                    disabled={revokeInvitation.isPending}
                    onClick={() => revokeInvitation.mutate(invitation.id)}
                  >
                    {t("invitations.revoke")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {adding && (
        <AddCoachDialog teamId={teamId} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}

function AddCoachDialog({
  teamId,
  onClose,
}: {
  teamId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const coaches = useTeamCoaches(teamId);
  const addCoach = useAddTeamCoach(teamId);
  const addMember = useAddMemberAsCoach(teamId);
  // One value across both groups, prefixed by where it came from — the two
  // lists are two id-spaces (an account, a roster row) and picking between
  // them is the same act to the person doing it.
  const [selected, setSelected] = useState("");
  // The picker is the common case; the address fields are for the person who
  // is in neither list, and are reached from it rather than shown beside it.
  const [byEmail, setByEmail] = useState(false);

  const candidates = sortCandidates(coaches.data?.candidates ?? []);
  const memberCandidates = sortMemberCandidates(
    coaches.data?.memberCandidates ?? [],
  );
  const nothingToPick =
    candidates.length === 0 && memberCandidates.length === 0;

  const handleAdd = async () => {
    if (selected.startsWith(MEMBER_PREFIX)) {
      await addMember.mutateAsync(selected.slice(MEMBER_PREFIX.length));
    } else {
      await addCoach.mutateAsync(selected.slice(USER_PREFIX.length));
    }
    onClose();
  };

  /**
   * Which account this roster row would appoint, in words. Said before the
   * press rather than after, because "this appoints Petra Förälder" is the
   * difference between a decision and an accident.
   */
  const memberNote = (candidate: MemberCoachCandidate): string => {
    if (candidate.action === "blocked") {
      return t(`settings.team.coachBlocked.${candidate.blockedReason}`);
    }
    if (candidate.accountName) {
      return t("settings.team.coachUsesAccount", {
        name: candidate.accountName,
        email: candidate.email,
      });
    }
    if (candidate.willCreateAccount) {
      return t("settings.team.coachCreatesAccount", { email: candidate.email });
    }
    return t("settings.team.coachHasAccount");
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {byEmail
              ? t("settings.team.coachByEmailTitle")
              : t("settings.team.addCoachTitle")}
          </DialogTitle>
        </DialogHeader>

        {byEmail ? (
          <CoachByEmailForm
            teamId={teamId}
            onDone={onClose}
            onBack={() => setByEmail(false)}
          />
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {(addCoach.isError || addMember.isError) && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {t("settings.team.addCoachError")}
                  </AlertDescription>
                </Alert>
              )}

              {nothingToPick ? (
                <Alert>
                  <AlertDescription>
                    {t("settings.team.noCandidates")}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="coach-user">
                    {t("settings.team.coachPerson")}
                  </Label>
                  <Select value={selected} onValueChange={setSelected}>
                    <SelectTrigger id="coach-user" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* The roster first: it is where an admin looks for a
                          name they know, and most clubs keep their leaders in
                          it alongside the players. */}
                      {memberCandidates.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>
                            {t("settings.team.coachFromTeam")}
                          </SelectLabel>
                          {memberCandidates.map((candidate) => (
                            <SelectItem
                              key={candidate.memberId}
                              value={`${MEMBER_PREFIX}${candidate.memberId}`}
                              disabled={candidate.action === "blocked"}
                            >
                              {candidate.firstName} {candidate.lastName} ·{" "}
                              {memberNote(candidate)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}

                      {candidates.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>
                            {t("settings.team.coachFromClub")}
                          </SelectLabel>
                          {candidates.map((candidate) => (
                            <SelectItem
                              key={candidate.userId}
                              value={`${USER_PREFIX}${candidate.userId}`}
                              /* Shown but unpickable: "why is she missing?" is
                                 a worse question than "why is she greyed
                                 out?", and the answer is on the row. */
                              disabled={!candidate.addable}
                            >
                              {candidate.name} ({candidate.email}) ·{" "}
                              {candidate.addable
                                ? (candidate.currentRole ??
                                  t("settings.team.coachNoRole"))
                                : t("settings.team.coachWiderAccess")}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={() => setByEmail(true)}
              >
                {t("settings.team.coachByEmail")}
              </Button>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("common.close")}
              </Button>
              <Button
                type="button"
                onClick={handleAdd}
                disabled={
                  selected === "" || addCoach.isPending || addMember.isPending
                }
              >
                {t("settings.team.addCoach")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CoachByEmailForm({
  teamId,
  onDone,
  onBack,
}: {
  teamId: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const addCoach = useAddCoachByEmail(teamId);

  const form = useForm<CoachByEmailFormValues, unknown, CoachByEmailFormOutput>(
    {
      resolver: useZodResolver(
        coachByEmailFormSchema,
        "settings.team.coachValidation",
      ),
      defaultValues: { name: "", email: "" },
    },
  );

  const handleAdd = form.handleSubmit(async (data) => {
    await addCoach.mutateAsync(data);
    onDone();
  });

  return (
    <>
      <Form {...form}>
        <form
          id="coach-by-email-form"
          className="grid gap-4"
          onSubmit={handleAdd}
          noValidate
        >
          {addCoach.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {t("settings.team.coachByEmailError")}
              </AlertDescription>
            </Alert>
          )}

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("settings.team.coachName")}</FormLabel>
                <FormControl>
                  <Input {...field} autoFocus maxLength={100} />
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
                <FormLabel>{t("settings.team.coachEmail")}</FormLabel>
                <FormControl>
                  <Input {...field} type="email" />
                </FormControl>
                <FormDescription>
                  {t("settings.team.coachEmailHint")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button
          type="submit"
          form="coach-by-email-form"
          disabled={addCoach.isPending}
        >
          {t("settings.team.addCoach")}
        </Button>
      </DialogFooter>
    </>
  );
}
