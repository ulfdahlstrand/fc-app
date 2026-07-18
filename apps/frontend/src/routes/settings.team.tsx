/**
 * Team settings — custom member fields (issue #8).
 *
 * Requires settings.team in the selected team. Lets managers define typed
 * member fields (text/number/date/boolean/select), edit them, and archive
 * them (values are preserved). Archived fields are hidden from the roster and
 * detail but not deleted.
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
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  memberFieldTypeSchema,
  type MemberFieldDefinition,
  type MemberFieldType,
} from "@fc-app/contracts";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import {
  useArchiveMemberField,
  useCreateMemberField,
  useMemberFields,
  useUpdateMemberField,
} from "../lib/member-fields";

export const Route = createFileRoute("/settings/team")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: TeamSettingsPage,
});

function TeamSettingsPage() {
  const { t } = useTranslation();
  const selected = useSelectedTeam();
  const canManage = useHasPermission("settings.team");

  if (!selected) {
    return <Alert severity="info">{t("members.noTeam")}</Alert>;
  }
  if (!canManage) {
    return <Alert severity="error">{t("settings.team.forbidden")}</Alert>;
  }

  return <MemberFields teamId={selected.team.id} teamName={selected.team.name} />;
}

function MemberFields({
  teamId,
  teamName,
}: {
  teamId: string;
  teamName: string;
}) {
  const { t } = useTranslation();
  const fields = useMemberFields(teamId, true);
  const archiveField = useArchiveMemberField(teamId);
  const [editing, setEditing] = useState<MemberFieldDefinition | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1">
          {t("settings.team.heading")}
        </Typography>
        <Typography color="text.secondary">{teamName}</Typography>
      </Box>

      <Box>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 1 }}
        >
          <Typography variant="h6">{t("settings.team.fields")}</Typography>
          <Button variant="contained" onClick={() => setCreating(true)}>
            {t("settings.team.newField")}
          </Button>
        </Stack>

        {fields.isPending ? (
          <Typography color="text.secondary">{t("common.loading")}</Typography>
        ) : fields.isError ? (
          <Alert severity="error">{t("settings.team.loadError")}</Alert>
        ) : fields.data.fields.length === 0 ? (
          <Typography color="text.secondary">
            {t("settings.team.empty")}
          </Typography>
        ) : (
          <Stack spacing={1}>
            {fields.data.fields.map((field) => (
              <Paper key={field.id} variant="outlined" sx={{ p: 2 }}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  flexWrap="wrap"
                  gap={1}
                >
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography fontWeight={500}>{field.name}</Typography>
                      <Chip
                        size="small"
                        label={t(`fieldType.${field.fieldType}`)}
                      />
                      {field.required && (
                        <Chip
                          size="small"
                          color="primary"
                          label={t("settings.team.required")}
                        />
                      )}
                      {field.archived && (
                        <Chip
                          size="small"
                          label={t("settings.team.archived")}
                        />
                      )}
                    </Stack>
                    {field.fieldType === "select" && (
                      <Typography variant="body2" color="text.secondary">
                        {field.options.join(", ")}
                      </Typography>
                    )}
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => setEditing(field)}>
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="small"
                      color={field.archived ? "primary" : "warning"}
                      disabled={archiveField.isPending}
                      onClick={() =>
                        archiveField.mutate({
                          fieldId: field.id,
                          archived: !field.archived,
                        })
                      }
                    >
                      {field.archived
                        ? t("settings.team.restore")
                        : t("settings.team.archive")}
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Box>

      {creating && (
        <FieldDialog teamId={teamId} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <FieldDialog
          teamId={teamId}
          field={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  );
}

const FIELD_TYPES = memberFieldTypeSchema.options;

function FieldDialog({
  teamId,
  field,
  onClose,
}: {
  teamId: string;
  field?: MemberFieldDefinition;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createField = useCreateMemberField(teamId);
  const updateField = useUpdateMemberField(teamId);
  const isEdit = field !== undefined;

  const [name, setName] = useState(field?.name ?? "");
  const [fieldType, setFieldType] = useState<MemberFieldType>(
    field?.fieldType ?? "text"
  );
  const [required, setRequired] = useState(field?.required ?? false);
  const [optionsText, setOptionsText] = useState(
    (field?.options ?? []).join("\n")
  );

  const options = optionsText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  const needsOptions = fieldType === "select";
  const canSave =
    name.trim() !== "" && (!needsOptions || options.length > 0);

  const pending = createField.isPending || updateField.isPending;
  const error = createField.isError || updateField.isError;

  const handleSave = async () => {
    if (isEdit) {
      await updateField.mutateAsync({
        fieldId: field.id,
        name: name.trim(),
        required,
        ...(field.fieldType === "select" ? { options } : {}),
      });
    } else {
      await createField.mutateAsync({
        name: name.trim(),
        fieldType,
        required,
        ...(needsOptions ? { options } : {}),
      });
    }
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isEdit ? t("settings.team.editField") : t("settings.team.newField")}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{t("settings.team.saveError")}</Alert>}
          <TextField
            label={t("settings.team.fieldName")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            select
            label={t("settings.team.fieldType")}
            value={fieldType}
            onChange={(event) =>
              setFieldType(event.target.value as MemberFieldType)
            }
            // Type is fixed after creation — changing it would invalidate
            // existing values.
            disabled={isEdit}
          >
            {FIELD_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {t(`fieldType.${type}`)}
              </MenuItem>
            ))}
          </TextField>
          {needsOptions && (
            <TextField
              label={t("settings.team.options")}
              value={optionsText}
              onChange={(event) => setOptionsText(event.target.value)}
              multiline
              minRows={3}
              helperText={t("settings.team.optionsHelp")}
            />
          )}
          <FormControlLabel
            control={
              <Switch
                checked={required}
                onChange={(event) => setRequired(event.target.checked)}
              />
            }
            label={t("settings.team.requiredLabel")}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!canSave || pending}
        >
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
