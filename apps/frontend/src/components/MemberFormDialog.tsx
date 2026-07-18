/**
 * Create/edit dialog for a member (issue #7). Shared by the roster list (new
 * member) and the detail page (edit). Validation mirrors the contract:
 * first/last name required, birth year optional within range.
 */
import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useTranslation } from "react-i18next";
import type { Member } from "@fc-app/contracts";
import type { MemberWriteInput } from "../lib/members";

export function MemberFormDialog({
  member,
  saving,
  error,
  onSave,
  onClose,
}: {
  member?: Member;
  saving: boolean;
  error: boolean;
  onSave: (input: MemberWriteInput) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState(member?.firstName ?? "");
  const [lastName, setLastName] = useState(member?.lastName ?? "");
  const [birthYear, setBirthYear] = useState(
    member?.birthYear != null ? String(member.birthYear) : ""
  );
  const [email, setEmail] = useState(member?.email ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");

  const yearNum = birthYear.trim() === "" ? null : Number(birthYear);
  const yearInvalid =
    yearNum !== null &&
    (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2100);

  const canSave =
    firstName.trim() !== "" && lastName.trim() !== "" && !yearInvalid;

  const handleSave = () => {
    onSave({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthYear: yearNum,
      email: email.trim() === "" ? null : email.trim(),
      phone: phone.trim() === "" ? null : phone.trim(),
    });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {member ? t("members.editTitle") : t("members.newTitle")}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{t("members.saveError")}</Alert>}
          <TextField
            label={t("members.firstName")}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            required
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            label={t("members.lastName")}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            required
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            label={t("members.birthYear")}
            value={birthYear}
            onChange={(event) => setBirthYear(event.target.value)}
            error={yearInvalid}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
          />
          <TextField
            type="email"
            label={t("members.email")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label={t("members.phone")}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!canSave || saving}
        >
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
