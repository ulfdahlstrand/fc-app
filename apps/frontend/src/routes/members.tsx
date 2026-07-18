/**
 * Members roster (issue #7) — the team's list of members.
 *
 * Requires members.view in the selected team. Supports search and an
 * archived filter; members.manage unlocks adding members. Rows link to the
 * detail page.
 */
import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MemberFormDialog } from "../components/MemberFormDialog";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import { useCreateMember, useMembers } from "../lib/members";

export const Route = createFileRoute("/members")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: MembersPage,
});

function MembersPage() {
  const { t } = useTranslation();
  const selected = useSelectedTeam();
  const canView = useHasPermission("members.view");

  if (!selected) {
    return <Alert severity="info">{t("members.noTeam")}</Alert>;
  }
  if (!canView) {
    return <Alert severity="error">{t("members.forbidden")}</Alert>;
  }

  return <Roster teamId={selected.team.id} teamName={selected.team.name} />;
}

function Roster({ teamId, teamName }: { teamId: string; teamName: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canManage = useHasPermission("members.manage");
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  const members = useMembers(teamId, { search, includeArchived });
  const createMember = useCreateMember(teamId);

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
            {t("members.heading")}
          </Typography>
          <Typography color="text.secondary">{teamName}</Typography>
        </Box>
        {canManage && (
          <Button variant="contained" onClick={() => setCreating(true)}>
            {t("members.add")}
          </Button>
        )}
      </Stack>

      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        flexWrap="wrap"
      >
        <TextField
          size="small"
          label={t("members.search")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <FormControlLabel
          control={
            <Switch
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
          }
          label={t("members.showArchived")}
        />
      </Stack>

      {members.isPending ? (
        <Typography color="text.secondary">{t("common.loading")}</Typography>
      ) : members.isError ? (
        <Alert severity="error">{t("members.loadError")}</Alert>
      ) : members.data.members.length === 0 ? (
        <Typography color="text.secondary">{t("members.empty")}</Typography>
      ) : (
        <Paper variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t("members.name")}</TableCell>
                <TableCell>{t("members.birthYear")}</TableCell>
                <TableCell>{t("members.contact")}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {members.data.members.map((member) => (
                <TableRow
                  key={member.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() =>
                    navigate({
                      to: "/members/$memberId",
                      params: { memberId: member.id },
                    })
                  }
                >
                  <TableCell>
                    {member.lastName}, {member.firstName}
                    {member.archived && (
                      <Chip
                        size="small"
                        label={t("members.archived")}
                        sx={{ ml: 1 }}
                      />
                    )}
                  </TableCell>
                  <TableCell>{member.birthYear ?? "—"}</TableCell>
                  <TableCell>{member.email ?? member.phone ?? "—"}</TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {creating && (
        <MemberFormDialog
          saving={createMember.isPending}
          error={createMember.isError}
          onSave={async (input) => {
            await createMember.mutateAsync(input);
            setCreating(false);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </Stack>
  );
}
