/**
 * Dialog to edit a member's custom field values (issue #8). Renders one input
 * per active field definition, typed by field: text/number/date inputs, a
 * yes/no switch for boolean, and a select for select fields. Client-side
 * validation mirrors the contract; the backend re-validates.
 *
 * Fields are dynamic (defined per-team), so this uses controlled local state
 * rather than react-hook-form/Zod — there's no static schema to derive a form
 * type from. Validation and save behavior are unchanged from the pre-shadcn
 * version.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  validateMemberFieldValue,
  type Member,
  type MemberFieldDefinition,
} from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

/** Sentinel select value for "no value" — Radix disallows an empty-string item value. */
const NO_VALUE = "__none__";

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("members.editFields")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{t("members.saveError")}</AlertDescription>
            </Alert>
          )}
          {fields.length === 0 && (
            <Alert>
              <AlertDescription>{t("members.noFields")}</AlertDescription>
            </Alert>
          )}
          {fields.map((field) => (
            <FieldInput
              key={field.id}
              field={field}
              value={values[field.id] ?? ""}
              onChange={(value) => setValue(field.id, value)}
            />
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={invalid || saving}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
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
  const id = `member-field-${field.id}`;

  if (field.fieldType === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Switch
          id={id}
          checked={value === "true"}
          onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
        />
        <Label htmlFor={id}>{label}</Label>
      </div>
    );
  }

  if (field.fieldType === "select") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Select
          value={value === "" ? NO_VALUE : value}
          onValueChange={(next) => onChange(next === NO_VALUE ? "" : next)}
        >
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_VALUE}>—</SelectItem>
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={field.fieldType === "date" ? "date" : field.fieldType === "number" ? "number" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...(field.fieldType === "number" ? { inputMode: "decimal" as const } : {})}
      />
    </div>
  );
}
