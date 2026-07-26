/**
 * Team settings — custom member fields (issue #8).
 *
 * Requires settings.team in the selected team. Lets managers define typed
 * member fields (text/number/date/boolean/select), edit them, and archive
 * them (values are preserved). Archived fields are hidden from the roster and
 * detail but not deleted.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  memberFieldTypeSchema,
  type MemberFieldDefinition,
} from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { cn } from "@/lib/utils";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import { useZodResolver } from "../lib/form";
import {
  memberFieldFormSchema,
  useArchiveMemberField,
  useCreateMemberField,
  useMemberFields,
  useUpdateMemberField,
  type MemberFieldFormOutput,
  type MemberFieldFormValues,
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
        <h1 className="text-2xl font-semibold tracking-tight">
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
              <div
                key={field.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{field.name}</p>
                    <Badge variant="secondary">
                      {t(`fieldType.${field.fieldType}`)}
                    </Badge>
                    {field.required && (
                      <Badge>{t("settings.team.required")}</Badge>
                    )}
                    {field.archived && (
                      <Badge variant="secondary">
                        {t("settings.team.archived")}
                      </Badge>
                    )}
                  </div>
                  {field.fieldType === "select" && (
                    <p className="text-sm text-muted-foreground">
                      {field.options.join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(field)}
                  >
                    {t("common.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={
                      field.archived
                        ? undefined
                        : "border-amber-300 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:border-amber-900 dark:text-amber-400 dark:hover:bg-amber-950"
                    }
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
              </div>
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

  const form = useForm<MemberFieldFormValues, unknown, MemberFieldFormOutput>({
    resolver: useZodResolver(memberFieldFormSchema, "settings.team.validation"),
    defaultValues: {
      name: field?.name ?? "",
      fieldType: field?.fieldType ?? "text",
      required: field?.required ?? false,
    },
  });
  const [optionsText, setOptionsText] = useState(
    (field?.options ?? []).join("\n")
  );

  const fieldType = form.watch("fieldType");
  const needsOptions = fieldType === "select";
  const options = optionsText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const canSave = !needsOptions || options.length > 0;

  const pending = createField.isPending || updateField.isPending;
  const error = createField.isError || updateField.isError;

  const handleSave = form.handleSubmit(async (data) => {
    if (isEdit) {
      await updateField.mutateAsync({
        fieldId: field.id,
        name: data.name,
        required: data.required,
        ...(field.fieldType === "select" ? { options } : {}),
      });
    } else {
      await createField.mutateAsync({
        name: data.name,
        fieldType: data.fieldType,
        required: data.required,
        ...(needsOptions ? { options } : {}),
      });
    }
    onClose();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("settings.team.editField") : t("settings.team.newField")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            id="field-form"
            className="grid gap-4"
            onSubmit={handleSave}
            noValidate
          >
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{t("settings.team.saveError")}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field: formField }) => (
                <FormItem>
                  <FormLabel>{t("settings.team.fieldName")}</FormLabel>
                  <FormControl>
                    <Input maxLength={100} {...formField} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fieldType"
              render={({ field: formField }) => (
                <FormItem>
                  <FormLabel>{t("settings.team.fieldType")}</FormLabel>
                  {/* Type is fixed after creation — changing it would
                      invalidate existing values. */}
                  <Select
                    value={formField.value}
                    onValueChange={formField.onChange}
                    disabled={isEdit}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FIELD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`fieldType.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {needsOptions && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="field-options">{t("settings.team.options")}</Label>
                <textarea
                  id="field-options"
                  rows={3}
                  value={optionsText}
                  onChange={(event) => setOptionsText(event.target.value)}
                  className={cn(
                    "border-input placeholder:text-muted-foreground dark:bg-input/30 flex min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm",
                    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                  )}
                />
                <p className="text-sm text-muted-foreground">
                  {t("settings.team.optionsHelp")}
                </p>
              </div>
            )}

            <FormField
              control={form.control}
              name="required"
              render={({ field: formField }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={formField.value}
                        onCheckedChange={formField.onChange}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">
                      {t("settings.team.requiredLabel")}
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            type="submit"
            form="field-form"
            disabled={!canSave || pending}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
