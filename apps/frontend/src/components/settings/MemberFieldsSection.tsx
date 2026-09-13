/** Custom member field definitions, archived rather than deleted (ADR-005, ADR-014). */
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
import { useZodResolver } from "@/lib/form";
import { moveField } from "@/lib/member-field-view";
import {
  memberFieldFormSchema,
  useArchiveMemberField,
  useCreateMemberField,
  useMemberFields,
  useReorderMemberFields,
  useUpdateMemberField,
  type MemberFieldFormOutput,
  type MemberFieldFormValues,
} from "@/lib/member-fields";
import { cn } from "@/lib/utils";
import {
  memberFieldTypeSchema,
  type MemberFieldDefinition,
} from "@fc-app/contracts";

export function MemberFields({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const fields = useMemberFields(teamId, true);
  const archiveField = useArchiveMemberField(teamId);
  const reorderFields = useReorderMemberFields(teamId);
  const [editing, setEditing] = useState<MemberFieldDefinition | null>(null);
  const [creating, setCreating] = useState(false);

  // The order on screen *is* the order that is saved — the server sorts by it
  // and every screen reads that sort, so a move here moves the roster column
  // and the member page's fields together.
  const ordered = fields.data?.fields ?? [];
  const move = (index: number, direction: -1 | 1): void => {
    const next = moveField(ordered, index, direction);
    // The buttons at either end are disabled, so this is belt and braces —
    // but an order that did not move is not worth a round trip.
    if (next.every((id, at) => id === ordered[at]?.id)) return;
    reorderFields.mutate(next);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl">{t("settings.team.fields")}</h2>
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
            {reorderFields.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {t("settings.team.reorderError")}
                </AlertDescription>
              </Alert>
            )}
            {ordered.map((field, index) => (
              <div
                key={field.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card p-3"
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
                    {!field.showInList && (
                      <Badge variant="secondary">
                        {t("settings.team.detailOnly")}
                      </Badge>
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
                    aria-label={t("settings.team.moveUp")}
                    title={t("settings.team.moveUp")}
                    disabled={index === 0 || reorderFields.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUpIcon className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={t("settings.team.moveDown")}
                    title={t("settings.team.moveDown")}
                    disabled={
                      index === ordered.length - 1 || reorderFields.isPending
                    }
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDownIcon className="size-4" />
                  </Button>
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
      showInList: field?.showInList ?? true,
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
        showInList: data.showInList,
        ...(field.fieldType === "select" ? { options } : {}),
      });
    } else {
      await createField.mutateAsync({
        name: data.name,
        fieldType: data.fieldType,
        required: data.required,
        showInList: data.showInList,
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

            {/* Every field is on the member's own page; this is only about
                whether the roster may carry it as a column. */}
            <FormField
              control={form.control}
              name="showInList"
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
                      {t("settings.team.showInListLabel")}
                    </FormLabel>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.team.showInListHint")}
                  </p>
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

/** Tracking lists (#19) — the configurable checklists the matrix at /tracking fills in. */
