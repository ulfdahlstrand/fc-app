/**
 * Club settings — roles & permissions (issue #5).
 *
 * Only reachable with the settings.club permission in the selected club.
 * Lists the club's roles, allows creating/renaming custom roles and toggling
 * their permissions, and deleting unused custom roles. The Admin role is
 * shown read-only (it always holds every permission).
 */
import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PERMISSIONS, type Permission, type Role } from "@fc-app/contracts";
import { InvitationsSection } from "../components/InvitationsSection";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, myClubsQueryOptions } from "../lib/clubs";
import {
  useCreateRole,
  useDeleteRole,
  useRoles,
  useUpdateRole,
} from "../lib/roles";

export const Route = createFileRoute("/settings/club")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: ClubSettingsPage,
});

function ClubSettingsPage() {
  const { t } = useTranslation();
  const clubs = useQuery(myClubsQueryOptions);
  // Manage the first club the caller can administer.
  const club = clubs.data?.clubs.find((c) =>
    c.permissions.includes("settings.club")
  );

  if (!club) {
    return <Alert severity="error">{t("settings.club.forbidden")}</Alert>;
  }

  return <ClubRoles clubId={club.id} clubName={club.name} />;
}

function ClubRoles({ clubId, clubName }: { clubId: string; clubName: string }) {
  const { t } = useTranslation();
  const roles = useRoles(clubId);
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1">
          {t("settings.club.heading")}
        </Typography>
        <Typography color="text.secondary">{clubName}</Typography>
      </Box>

      <Box>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 1 }}
        >
          <Typography variant="h6">{t("settings.club.roles")}</Typography>
          <Button variant="contained" onClick={() => setCreating(true)}>
            {t("settings.club.newRole")}
          </Button>
        </Stack>

        {roles.isPending ? (
          <Typography color="text.secondary">{t("common.loading")}</Typography>
        ) : roles.isError ? (
          <Alert severity="error">{t("settings.club.loadError")}</Alert>
        ) : (
          <Stack spacing={1}>
            {roles.data.roles.map((role) => (
              <RoleRow
                key={role.id}
                clubId={clubId}
                role={role}
                onEdit={() => setEditing(role)}
              />
            ))}
          </Stack>
        )}
      </Box>

      <InvitationsSection clubId={clubId} />

      {creating && (
        <RoleDialog
          clubId={clubId}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <RoleDialog
          clubId={clubId}
          role={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

function RoleRow({
  clubId,
  role,
  onEdit,
}: {
  clubId: string;
  role: Role;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const deleteRole = useDeleteRole(clubId);
  const isAdmin = role.systemKey === "admin";
  const isSystem = role.systemKey !== null;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography fontWeight={500}>{role.name}</Typography>
            {isSystem && (
              <Chip size="small" label={t("settings.club.system")} />
            )}
            <Typography variant="body2" color="text.secondary">
              {t("settings.club.memberCount", { count: role.memberCount })}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {role.permissions.length}{" "}
            {t("settings.club.permissionsCount")}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={onEdit} disabled={isAdmin}>
            {isAdmin ? t("settings.club.view") : t("common.edit")}
          </Button>
          {!isSystem && (
            <Button
              size="small"
              color="error"
              disabled={role.memberCount > 0 || deleteRole.isPending}
              onClick={() => deleteRole.mutate(role.id)}
            >
              {t("common.delete")}
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

function RoleDialog({
  clubId,
  role,
  onClose,
}: {
  clubId: string;
  role?: Role;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createRole = useCreateRole(clubId);
  const updateRole = useUpdateRole(clubId);
  const readOnly = role?.systemKey === "admin";

  const [name, setName] = useState(role?.name ?? "");
  const [permissions, setPermissions] = useState<Permission[]>(
    role?.permissions ?? []
  );

  const toggle = (permission: Permission) => {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission]
    );
  };

  const pending = createRole.isPending || updateRole.isPending;
  const error = createRole.error ?? updateRole.error;

  const handleSave = async () => {
    if (role) {
      await updateRole.mutateAsync({ roleId: role.id, name, permissions });
    } else {
      await createRole.mutateAsync({ name, permissions });
    }
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {role
          ? readOnly
            ? role.name
            : t("settings.club.editRole")
          : t("settings.club.newRole")}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{t("settings.club.saveError")}</Alert>}
          <TextField
            label={t("settings.club.roleName")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={readOnly}
            required
            slotProps={{ htmlInput: { maxLength: 50 } }}
          />
          <Typography variant="subtitle2">
            {t("settings.club.permissions")}
          </Typography>
          <FormGroup>
            {PERMISSIONS.map((permission) => (
              <FormControlLabel
                key={permission}
                control={
                  <Checkbox
                    checked={permissions.includes(permission)}
                    onChange={() => toggle(permission)}
                    disabled={readOnly}
                  />
                }
                label={t(`permissions.${permission}`)}
              />
            ))}
          </FormGroup>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
        {!readOnly && (
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={pending || name.trim().length === 0}
          >
            {t("common.save")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
