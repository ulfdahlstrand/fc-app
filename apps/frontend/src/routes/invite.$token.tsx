/**
 * Invite acceptance route (issue #6).
 *
 * Works signed out: resolves the token to show which club/team and role the
 * invitation grants, plus its status. Signed-out visitors stash the token and
 * sign in with Google (returning here via the index redirect). Signed-in
 * visitors with an active invitation get an Accept button that joins them and
 * selects the new team.
 */
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ensureMe, getGoogleSignInUrl, meQueryOptions } from "../lib/auth";
import { selectTeam } from "../lib/clubs";
import { setPendingInvite } from "../lib/invitations";
import { orpc } from "../orpc-client";
import { queryClient } from "../query-client";

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
    <Stack alignItems="center" sx={{ mt: 6 }}>
      <Paper sx={{ p: 4, maxWidth: 480, width: "100%" }}>
        <Stack spacing={3}>
          <Typography variant="h5" component="h1">
            {t("invite.heading")}
          </Typography>

          {invitation.isPending ? (
            <Stack alignItems="center" sx={{ py: 2 }}>
              <CircularProgress />
            </Stack>
          ) : invitation.isError ? (
            <Alert severity="error">{t("invite.notFound")}</Alert>
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
        </Stack>
      </Paper>
    </Stack>
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
    return <Alert severity="warning">{t(`invite.status.${props.status}`)}</Alert>;
  }

  return (
    <>
      <Typography>
        {t("invite.description", { target, role: props.roleName })}
      </Typography>
      {props.restrictedEmail && (
        <Alert severity="info">
          {t("invite.emailRestricted", { email: props.restrictedEmail })}
        </Alert>
      )}
      {props.acceptError && (
        <Alert severity="error">{t("invite.acceptError")}</Alert>
      )}
      {props.signedIn ? (
        <Button
          variant="contained"
          size="large"
          onClick={props.onAccept}
          disabled={props.accepting}
        >
          {t("invite.accept")}
        </Button>
      ) : (
        <Button variant="contained" size="large" onClick={props.onSignIn}>
          {t("invite.signInToAccept")}
        </Button>
      )}
    </>
  );
}
