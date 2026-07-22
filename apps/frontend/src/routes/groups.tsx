/**
 * Groups page (issue #10) — custom, team-scoped member groups reusable for
 * roster filtering, call-up squad selection (#16), and post targeting (#18).
 *
 * Requires members.view; members.manage unlocks create/rename/delete and
 * managing membership.
 */
import { useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField, { type TextFieldProps } from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Group } from "@fc-app/contracts";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import {
  useCreateGroup,
  useDeleteGroup,
  useGroupMembers,
  useGroups,
  useRenameGroup,
  useSetGroupMembers,
} from "../lib/groups";
import { useMembers } from "../lib/members";

export const Route = createFileRoute("/groups")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: GroupsPage,
});

function GroupsPage() {
  const { t } = useTranslation();
  const selected = useSelectedTeam();
  const canView = useHasPermission("members.view");

  if (!selected) {
    return <Alert severity="info">{t("members.noTeam")}</Alert>;
  }
  if (!canView) {
    return <Alert severity="error">{t("groups.forbidden")}</Alert>;
  }

  return <GroupsList teamId={selected.team.id} teamName={selected.team.name} />;
}

function GroupsList({ teamId, teamName }: { teamId: string; teamName: string }) {
  const { t } = useTranslation();
  const canManage = useHasPermission("members.manage");
  const groups = useGroups(teamId);
  const renameGroup = useRenameGroup(teamId);
  const deleteGroup = useDeleteGroup(teamId);
  const [creating, setCreating] = useState(false);
  const [managingMembers, setManagingMembers] = useState<Group | null>(null);
  const [renaming, setRenaming] = useState<Group | null>(null);
  const [renameValue, setRenameValue] = useState("");

  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap={1}
      >
        <Box>
          <Typography variant="h4" component="h1">
            {t("groups.heading")}
          </Typography>
          <Typography color="text.secondary">{teamName}</Typography>
        </Box>
        {canManage && (
          <Button variant="contained" onClick={() => setCreating(true)}>
            {t("groups.new")}
          </Button>
        )}
      </Stack>

      {groups.isPending ? (
        <Typography color="text.secondary">{t("common.loading")}</Typography>
      ) : groups.isError ? (
        <Alert severity="error">{t("groups.loadError")}</Alert>
      ) : groups.data.groups.length === 0 ? (
        <Typography color="text.secondary">{t("groups.empty")}</Typography>
      ) : (
        <Stack spacing={1}>
          {groups.data.groups.map((group) => (
            <Paper key={group.id} variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                flexWrap="wrap"
                gap={1}
              >
                <Box>
                  <Typography fontWeight={500}>{group.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t("groups.memberCount", { count: group.memberCount })}
                  </Typography>
                </Box>
                {canManage && (
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      onClick={() => setManagingMembers(group)}
                    >
                      {t("groups.manageMembers")}
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        setRenaming(group);
                        setRenameValue(group.name);
                      }}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      disabled={deleteGroup.isPending}
                      onClick={() => deleteGroup.mutate(group.id)}
                    >
                      {t("common.delete")}
                    </Button>
                  </Stack>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {creating && (
        <CreateGroupDialog teamId={teamId} onClose={() => setCreating(false)} />
      )}

      {renaming && (
        <Dialog open onClose={() => setRenaming(null)} maxWidth="sm" fullWidth>
          <DialogTitle>{t("groups.rename")}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {renameGroup.isError && (
                <Alert severity="error">{t("groups.saveError")}</Alert>
              )}
              <TextField
                label={t("groups.name")}
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                required
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRenaming(null)}>
              {t("common.close")}
            </Button>
            <Button
              variant="contained"
              disabled={renameValue.trim() === "" || renameGroup.isPending}
              onClick={async () => {
                await renameGroup.mutateAsync({
                  groupId: renaming.id,
                  name: renameValue.trim(),
                });
                setRenaming(null);
              }}
            >
              {t("common.save")}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {managingMembers && (
        <ManageGroupMembersDialog
          teamId={teamId}
          group={managingMembers}
          onClose={() => setManagingMembers(null)}
        />
      )}
    </Stack>
  );
}

function CreateGroupDialog({
  teamId,
  onClose,
}: {
  teamId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createGroup = useCreateGroup(teamId);
  const [name, setName] = useState("");

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("groups.new")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {createGroup.isError && (
            <Alert severity="error">{t("groups.saveError")}</Alert>
          )}
          <TextField
            label={t("groups.name")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
        <Button
          variant="contained"
          disabled={name.trim() === "" || createGroup.isPending}
          onClick={async () => {
            await createGroup.mutateAsync(name.trim());
            onClose();
          }}
        >
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ManageGroupMembersDialog({
  teamId,
  group,
  onClose,
}: {
  teamId: string;
  group: Group;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const allMembers = useMembers(teamId, {});
  const groupMembers = useGroupMembers(teamId, group.id);
  const setGroupMembers = useSetGroupMembers(teamId, group.id);
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);

  const ready = allMembers.data && groupMembers.data;
  const currentIds = selectedIds ?? groupMembers.data?.memberIds ?? [];
  const options = allMembers.data?.members ?? [];
  const selectedOptions = options.filter((member) =>
    currentIds.includes(member.id)
  );

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t("groups.membersOf", { name: group.name })}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {setGroupMembers.isError && (
            <Alert severity="error">{t("groups.saveError")}</Alert>
          )}
          {!ready ? (
            <Typography color="text.secondary">
              {t("common.loading")}
            </Typography>
          ) : (
            <Autocomplete
              multiple
              options={options}
              value={selectedOptions}
              getOptionLabel={(member) =>
                `${member.lastName}, ${member.firstName}`
              }
              isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_event, value) =>
                setSelectedIds(value.map((member) => member.id))
              }
              renderInput={(params) => (
                // MUI's AutocompleteRenderInputParams has optional fields
                // (e.g. InputLabelProps.className) typed as `X | undefined`,
                // which exactOptionalPropertyTypes rejects when spread into
                // TextFieldProps — a known upstream typing friction, not a
                // real prop mismatch.
                <TextField {...(params as TextFieldProps)} label={t("groups.members")} />
              )}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
        <Button
          variant="contained"
          disabled={!ready || setGroupMembers.isPending}
          onClick={async () => {
            await setGroupMembers.mutateAsync(currentIds);
            onClose();
          }}
        >
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
