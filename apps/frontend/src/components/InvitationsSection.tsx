/**
 * Invitations manager for the club settings page (issue #6).
 *
 * Lists a club's invitations with status, lets managers create a new invite
 * (role required, optional team scope and email restriction), copy the link,
 * and revoke active ones.
 */
import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Invitation, InvitationStatus, MyClub } from "@fc-app/contracts";
import { myClubsQueryOptions } from "../lib/clubs";
import {
  invitationLink,
  useCreateInvitation,
  useInvitations,
  useRevokeInvitation,
} from "../lib/invitations";
import { useRoles } from "../lib/roles";

const STATUS_COLOR: Record<
  InvitationStatus,
  "success" | "default" | "warning" | "error"
> = {
  active: "success",
  used: "default",
  expired: "warning",
  revoked: "error",
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
    <Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1 }}
      >
        <Typography variant="h6">{t("invitations.heading")}</Typography>
        <Button variant="contained" onClick={() => setCreating(true)}>
          {t("invitations.new")}
        </Button>
      </Stack>

      {invitations.isPending ? (
        <Typography color="text.secondary">{t("common.loading")}</Typography>
      ) : invitations.isError ? (
        <Alert severity="error">{t("invitations.loadError")}</Alert>
      ) : invitations.data.invitations.length === 0 ? (
        <Typography color="text.secondary">{t("invitations.empty")}</Typography>
      ) : (
        <Stack spacing={1}>
          {invitations.data.invitations.map((invitation) => (
            <Paper key={invitation.id} variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                flexWrap="wrap"
                gap={1}
              >
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography fontWeight={500}>
                      {invitation.roleName}
                    </Typography>
                    {invitation.teamName && (
                      <Chip size="small" label={invitation.teamName} />
                    )}
                    <Chip
                      size="small"
                      color={STATUS_COLOR[invitation.status]}
                      label={t(`invite.status.${invitation.status}`)}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {invitation.email ?? t("invitations.anyEmail")}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  {invitation.status === "active" && (
                    <>
                      <Button size="small" onClick={() => copyLink(invitation)}>
                        {copiedId === invitation.id
                          ? t("invitations.copied")
                          : t("invitations.copyLink")}
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate(invitation.id)}
                      >
                        {t("invitations.revoke")}
                      </Button>
                    </>
                  )}
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {creating && (
        <CreateInvitationDialog
          clubId={clubId}
          onClose={() => setCreating(false)}
        />
      )}
    </Box>
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
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("invitations.new")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {createInvitation.isError && (
            <Alert severity="error">{t("invitations.createError")}</Alert>
          )}
          <TextField
            select
            label={t("invitations.role")}
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            required
          >
            {(roles.data?.roles ?? []).map((role) => (
              <MenuItem key={role.id} value={role.id}>
                {role.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t("invitations.team")}
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            helperText={t("invitations.teamHelp")}
          >
            <MenuItem value="">{t("invitations.clubWide")}</MenuItem>
            {(club?.teams ?? []).map((team) => (
              <MenuItem key={team.id} value={team.id}>
                {team.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="email"
            label={t("invitations.email")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            helperText={t("invitations.emailHelp")}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
        <Button
          variant="contained"
          onClick={handleCreate}
          disabled={roleId === "" || createInvitation.isPending}
        >
          {t("invitations.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
