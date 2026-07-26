/**
 * Invite acceptance route (issue #6).
 *
 * Works signed out: resolves the token to show which club/team and role the
 * invitation grants, plus its status. Signed-out visitors stash the token and
 * sign in with Google (returning here via the index redirect). Signed-in
 * visitors with an active invitation get an Accept button that joins them and
 * selects the new team.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ensureMe, getGoogleSignInUrl, meQueryOptions } from "@/lib/auth";
import { selectTeam } from "@/lib/clubs";
import { setPendingInvite } from "@/lib/invitations";
import { orpc } from "@/orpc-client";
import { queryClient } from "@/query-client";

export const Route = createFileRoute("/invite/$token")({
  loader: async () => {
    // Resolve the current user without redirecting — the page renders for both
    // signed-in and signed-out visitors.
    await ensureMe();
  },
  component: InvitePage,
});

function InvitePage() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;

  const invitation = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => orpc.getInvitation({ token }),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => orpc.acceptInvitation({ token }),
    onSuccess: async ({ teamId }) => {
      if (teamId) selectTeam(teamId);
      await queryClient.invalidateQueries({ queryKey: ["myClubs"] });
      await navigate({ to: "/" });
    },
  });

  const handleSignIn = () => {
    setPendingInvite(token);
    window.location.href = getGoogleSignInUrl();
  };

  return (
    <div className="mt-12 flex justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{t("invite.heading")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {invitation.isPending ? (
            <div className="flex justify-center py-2">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          ) : invitation.isError ? (
            <Alert variant="destructive">
              <AlertDescription>{t("invite.notFound")}</AlertDescription>
            </Alert>
          ) : (
            <InviteBody
              status={invitation.data.invitation.status}
              clubName={invitation.data.invitation.clubName}
              teamName={invitation.data.invitation.teamName}
              roleName={invitation.data.invitation.roleName}
              restrictedEmail={invitation.data.invitation.email}
              signedIn={Boolean(user)}
              acceptError={accept.isError}
              accepting={accept.isPending}
              onAccept={() => accept.mutate()}
              onSignIn={handleSignIn}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InviteBody(props: {
  status: "active" | "expired" | "revoked" | "used";
  clubName: string;
  teamName: string | null;
  roleName: string;
  restrictedEmail: string | null;
  signedIn: boolean;
  acceptError: boolean;
  accepting: boolean;
  onAccept: () => void;
  onSignIn: () => void;
}) {
  const { t } = useTranslation();

  const target = props.teamName
    ? `${props.clubName} — ${props.teamName}`
    : props.clubName;

  if (props.status !== "active") {
    return (
      <Alert>
        <AlertDescription>
          {t(`invite.status.${props.status}`)}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <p className="text-sm">
        {t("invite.description", { target, role: props.roleName })}
      </p>
      {props.restrictedEmail && (
        <Alert>
          <AlertDescription>
            {t("invite.emailRestricted", { email: props.restrictedEmail })}
          </AlertDescription>
        </Alert>
      )}
      {props.acceptError && (
        <Alert variant="destructive">
          <AlertDescription>{t("invite.acceptError")}</AlertDescription>
        </Alert>
      )}
      {props.signedIn ? (
        <Button size="lg" onClick={props.onAccept} disabled={props.accepting}>
          {t("invite.accept")}
        </Button>
      ) : (
        <Button size="lg" onClick={props.onSignIn}>
          {t("invite.signInToAccept")}
        </Button>
      )}
    </>
  );
}
