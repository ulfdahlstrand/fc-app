/**
 * Guardians section on the member detail page (issue #9). Lists linked user
 * accounts and, with members.manage, lets a manager link an existing club
 * user (as guardian or self) or unlink one.
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
import { useTranslation } from "react-i18next";
import type { GuardianRelation } from "@fc-app/contracts";
import { useHasPermission } from "../lib/clubs";
import {
  useAddGuardian,
  useClubUsers,
  useMemberGuardians,
  useRemoveGuardian,
} from "../lib/guardians";

export function GuardiansSection({
  teamId,
  memberId,
}: {
  teamId: string;
  memberId: string;
}) {
  const { t } = useTranslation();
  const canManage = useHasPermission("members.manage");
  const guardians = useMemberGuardians(teamId, memberId);
  const removeGuardian = useRemoveGuardian(teamId, memberId);
  const [linking, setLinking] = useState(false);

  return (
    <Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1 }}
      >
        <Typography variant="h6">{t("guardians.heading")}</Typography>
        {canManage && (
          <Button size="small" onClick={() => setLinking(true)}>
            {t("guardians.link")}
          </Button>
        )}
      </Stack>

      {guardians.isPending ? (
        <Typography color="text.secondary">{t("common.loading")}</Typography>
      ) : guardians.isError ? (
        <Alert severity="error">{t("guardians.loadError")}</Alert>
      ) : guardians.data.guardians.length === 0 ? (
        <Typography color="text.secondary">{t("guardians.empty")}</Typography>
      ) : (
        <Stack spacing={1}>
          {guardians.data.guardians.map((guardian) => (
            <Paper key={guardian.userId} variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                flexWrap="wrap"
                gap={1}
              >
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography fontWeight={500}>{guardian.name}</Typography>
                    <Chip
                      size="small"
                      label={t(`guardians.relation.${guardian.relation}`)}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {guardian.email}
                  </Typography>
                </Box>
                {canManage && (
                  <Button
                    size="small"
                    color="error"
                    disabled={removeGuardian.isPending}
                    onClick={() => removeGuardian.mutate(guardian.userId)}
                  >
                    {t("guardians.unlink")}
                  </Button>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {linking && (
        <LinkGuardianDialog
          teamId={teamId}
          memberId={memberId}
          linkedUserIds={
            new Set(guardians.data?.guardians.map((g) => g.userId) ?? [])
          }
          onClose={() => setLinking(false)}
        />
      )}
    </Box>
  );
}

function LinkGuardianDialog({
  teamId,
  memberId,
  linkedUserIds,
  onClose,
}: {
  teamId: string;
  memberId: string;
  linkedUserIds: Set<string>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const clubUsers = useClubUsers(teamId);
  const addGuardian = useAddGuardian(teamId, memberId);
  const [userId, setUserId] = useState("");
  const [relation, setRelation] = useState<GuardianRelation>("guardian");

  const available = (clubUsers.data?.users ?? []).filter(
    (user) => !linkedUserIds.has(user.id)
  );

  const handleLink = async () => {
    await addGuardian.mutateAsync({ userId, relation });
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("guardians.linkTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {addGuardian.isError && (
            <Alert severity="error">{t("guardians.linkError")}</Alert>
          )}
          {available.length === 0 ? (
            <Alert severity="info">{t("guardians.noUsers")}</Alert>
          ) : (
            <>
              <TextField
                select
                label={t("guardians.user")}
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                required
              >
                {available.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label={t("guardians.relationLabel")}
                value={relation}
                onChange={(event) =>
                  setRelation(event.target.value as GuardianRelation)
                }
              >
                <MenuItem value="guardian">
                  {t("guardians.relation.guardian")}
                </MenuItem>
                <MenuItem value="self">
                  {t("guardians.relation.self")}
                </MenuItem>
              </TextField>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
        <Button
          variant="contained"
          onClick={handleLink}
          disabled={userId === "" || addGuardian.isPending}
        >
          {t("guardians.link")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
