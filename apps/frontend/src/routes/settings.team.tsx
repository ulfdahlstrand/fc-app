/**
 * Team settings — custom member fields (issue #8).
 *
 * Requires settings.team in the selected team. Lets managers define typed
 * member fields (text/number/date/boolean/select), edit them, and archive
 * them (values are preserved). Archived fields are hidden from the roster and
 * detail but not deleted.
 */
import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  memberFieldTypeSchema,
  type MemberFieldDefinition,
  type MemberFieldType,
} from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { ensureMe } from "@/lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "@/lib/clubs";
import {
  useArchiveMemberField,
  useCreateMemberField,
  useMemberFields,
  useUpdateMemberField,
} from "@/lib/member-fields";

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
    return (
      <Alert>
        <AlertDescription>{t("members.noTeam")}</AlertDescription>
      </Alert>
    );
  }
  if (!canManage) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("settings.team.forbidden")}</AlertDescription>
      </Alert>
    );
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("settings.team.heading")}
        </h1>
        <p className="text-muted-foreground">{teamName}</p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("settings.team.fields")}</h2>
          <Button onClick={() => setCreating(true)}>
            {t("settings.team.newField")}
          </Button>
        </div>

        {fields.isPending ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : fields.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{t("settings.team.loadError")}</AlertDescription>
          </Alert>
        ) : fields.data.fields.length === 0 ? (
          <p className="text-muted-foreground">{t("settings.team.empty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {fields.data.fields.map((field) => (
              <Card key={field.id} className="py-4">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{field.name}</span>
                      <Badge variant="secondary">
                        {t(`fieldType.${field.fieldType}`)}
                      </Badge>
                      {field.required && (
                        <Badge>{t("settings.team.required")}</Badge>
                      )}
                      {field.archived && (
                        <Badge variant="outline">
                          {t("settings.team.archived")}
                        </Badge>
                      )}
                    </div>
                    {field.fieldType === "select" && (
                      <p className="text-muted-foreground text-sm">
                        {field.options.join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(field)}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
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
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

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
    </div>
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
  const canSave = name.trim() !== "" && (!needsOptions || options.length > 0);

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("settings.team.editField") : t("settings.team.newField")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {t("settings.team.saveError")}
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="field-name">{t("settings.team.fieldName")}</Label>
            <Input
              id="field-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="field-type">{t("settings.team.fieldType")}</Label>
            <Select
              value={fieldType}
              onValueChange={(value) => setFieldType(value as MemberFieldType)}
              // Type is fixed after creation — changing it would invalidate
              // existing values.
              disabled={isEdit}
            >
              <SelectTrigger id="field-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`fieldType.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsOptions && (
            <div className="grid gap-1.5">
              <Label htmlFor="field-options">{t("settings.team.options")}</Label>
              <Textarea
                id="field-options"
                value={optionsText}
                onChange={(event) => setOptionsText(event.target.value)}
                rows={3}
              />
              <p className="text-muted-foreground text-sm">
                {t("settings.team.optionsHelp")}
              </p>
            </div>
          )}
          <Label htmlFor="field-required" className="gap-2">
            <Switch
              id="field-required"
              checked={required}
              onCheckedChange={setRequired}
            />
            {t("settings.team.requiredLabel")}
          </Label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button onClick={handleSave} disabled={!canSave || pending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
