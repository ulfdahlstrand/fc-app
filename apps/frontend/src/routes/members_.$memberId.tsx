/**
 * Member detail page (issue #7) — the anchor page later features extend
 * (custom fields #8, guardians #9, groups #10, attendance history #15).
 *
 * Requires members.view in the selected team; members.manage unlocks edit and
 * archive/unarchive.
 */
import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MemberFormDialog } from "../components/MemberFormDialog";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import { useMember, useSetMemberArchived, useUpdateMember } from "../lib/members";

export const Route = createFileRoute("/members_/$memberId")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: MemberDetailPage,
});

function MemberDetailPage() {
  const { t } = useTranslation();
  const { memberId } = Route.useParams();
  const selected = useSelectedTeam();
  const canView = useHasPermission("members.view");

  if (!selected) {
    return <Alert severity="info">{t("members.noTeam")}</Alert>;
  }
  if (!canView) {
    return <Alert severity="error">{t("members.forbidden")}</Alert>;
  }

  return <MemberDetail teamId={selected.team.id} memberId={memberId} />;
}

function MemberDetail({
  teamId,
  memberId,
}: {
  teamId: string;
  memberId: string;
}) {
  const { t } = useTranslation();
  const canManage = useHasPermission("members.manage");
  const member = useMember(teamId, memberId);
  const updateMember = useUpdateMember(teamId);
  const setArchived = useSetMemberArchived(teamId);
  const [editing, setEditing] = useState(false);

  if (member.isPending) {
    return <Typography color="text.secondary">{t("common.loading")}</Typography>;
  }
  if (member.isError) {
    return <Alert severity="error">{t("members.notFound")}</Alert>;
  }

  const m = member.data.member;

  return (
    <Stack spacing={3}>
      <Button component={Link} to="/members" sx={{ alignSelf: "flex-start" }}>
        ← {t("members.backToList")}
      </Button>

      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap={1}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h4" component="h1">
            {m.firstName} {m.lastName}
          </Typography>
          {m.archived && <Chip label={t("members.archived")} />}
        </Stack>
        {canManage && (
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => setEditing(true)}>
              {t("common.edit")}
            </Button>
            <Button
              variant="outlined"
              color={m.archived ? "primary" : "warning"}
              disabled={setArchived.isPending}
              onClick={() =>
                setArchived.mutate({ memberId: m.id, archived: !m.archived })
              }
            >
              {m.archived ? t("members.unarchive") : t("members.archive_action")}
            </Button>
          </Stack>
        )}
      </Stack>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Field label={t("members.birthYear")} value={m.birthYear} />
          <Divider />
          <Field label={t("members.email")} value={m.email} />
          <Divider />
          <Field label={t("members.phone")} value={m.phone} />
        </Stack>
      </Paper>

      {editing && (
        <MemberFormDialog
          member={m}
          saving={updateMember.isPending}
          error={updateMember.isError}
          onSave={async (input) => {
            await updateMember.mutateAsync({ memberId: m.id, ...input });
            setEditing(false);
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </Stack>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography>{value ?? "—"}</Typography>
    </Box>
  );
}
