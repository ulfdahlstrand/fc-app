/**
 * Dialog to edit a member's custom field values (issue #8). Renders one input
 * per active field definition, typed by field: text/number/date inputs, a
 * yes/no switch for boolean, and a select for select fields. Client-side
 * validation mirrors the contract; the backend re-validates.
 */
import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import { useTranslation } from "react-i18next";
import {
  validateMemberFieldValue,
  type Member,
  type MemberFieldDefinition,
} from "@fc-app/contracts";

export function MemberFieldValuesDialog({
  fields,
  member,
  saving,
  error,
  onSave,
  onClose,
}: {
  fields: MemberFieldDefinition[];
  member: Member;
  saving: boolean;
  error: boolean;
  onSave: (values: Record<string, string | null>) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      initial[field.id] = member.customFields[field.id] ?? "";
    }
    return initial;
  });

  const setValue = (id: string, value: string) =>
    setValues((current) => ({ ...current, [id]: value }));

  const invalid = fields.some((field) => {
    const raw = values[field.id] ?? "";
    if (raw.trim() === "") return field.required;
    return !validateMemberFieldValue(field, raw).ok;
  });

  const handleSave = () => {
    // Send every field: blank clears it, non-blank sets it.
    const payload: Record<string, string | null> = {};
    for (const field of fields) {
      const raw = values[field.id] ?? "";
      payload[field.id] = raw.trim() === "" ? null : raw;
    }
    onSave(payload);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("members.editFields")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{t("members.saveError")}</Alert>}
          {fields.length === 0 && (
            <Alert severity="info">{t("members.noFields")}</Alert>
          )}
          {fields.map((field) => (
            <FieldInput
              key={field.id}
              field={field}
              value={values[field.id] ?? ""}
              onChange={(value) => setValue(field.id, value)}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={invalid || saving}
        >
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: MemberFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  const label = field.required ? `${field.name} *` : field.name;

  if (field.fieldType === "boolean") {
    return (
      <FormControlLabel
        control={
          <Switch
            checked={value === "true"}
            onChange={(event) => onChange(event.target.checked ? "true" : "false")}
          />
        }
        label={label}
      />
    );
  }

  if (field.fieldType === "select") {
    return (
      <TextField
        select
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <MenuItem value="">—</MenuItem>
        {field.options.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  return (
    <TextField
      label={label}
      type={field.fieldType === "date" ? "date" : "text"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      {...(field.fieldType === "number"
        ? { slotProps: { htmlInput: { inputMode: "decimal" } } }
        : {})}
      {...(field.fieldType === "date"
        ? { slotProps: { inputLabel: { shrink: true } } }
        : {})}
    />
  );
}
