/** Activity types — a Kit colour token rather than a free colour (ADR-005, DDR-001). */
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
import { Switch } from "@/components/ui/switch";
import {
  ACTIVITY_COLOURS,
  ACTIVITY_COLOUR_DOT,
  activityTypeFormSchema,
  useActivityTypes,
  useArchiveActivityType,
  useCreateActivityType,
  useUpdateActivityType,
  type ActivityTypeFormOutput,
  type ActivityTypeFormValues,
} from "@/lib/activity-types";
import { useZodResolver } from "@/lib/form";
import { cn } from "@/lib/utils";
import { type ActivityType } from "@fc-app/contracts";

export function ActivityTypes({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const activityTypes = useActivityTypes(teamId, true);
  const archiveType = useArchiveActivityType(teamId);
  const [editing, setEditing] = useState<ActivityType | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl">
          {t("settings.team.activityTypes")}
        </h2>
        <Button onClick={() => setCreating(true)}>
          {t("settings.team.newActivityType")}
        </Button>
      </div>

      {activityTypes.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : activityTypes.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {t("settings.team.activityTypesLoadError")}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-2">
          {activityTypes.data.activityTypes.map((type) => (
            <div
              key={type.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card p-3"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0 rounded-full",
                    ACTIVITY_COLOUR_DOT[type.colour],
                  )}
                />
                <p className="font-medium">{type.name}</p>
                {type.supportsCallUps && (
                  <Badge variant="secondary">
                    {t("settings.team.supportsCallUps")}
                  </Badge>
                )}
                {/* Not the dashed `unset` badge: in Kit a dashed ring always
                    means "not decided yet", never "retired". */}
                {type.archived && (
                  <Badge variant="secondary">
                    {t("settings.team.archived")}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(type)}
                >
                  {t("common.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={archiveType.isPending}
                  onClick={() =>
                    archiveType.mutate({
                      activityTypeId: type.id,
                      archived: !type.archived,
                    })
                  }
                >
                  {type.archived
                    ? t("settings.team.restore")
                    : t("settings.team.archive")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <ActivityTypeDialog
          teamId={teamId}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <ActivityTypeDialog
          teamId={teamId}
          activityType={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ActivityTypeDialog({
  teamId,
  activityType,
  onClose,
}: {
  teamId: string;
  activityType?: ActivityType;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createType = useCreateActivityType(teamId);
  const updateType = useUpdateActivityType(teamId);
  const isEdit = activityType !== undefined;

  const form = useForm<
    ActivityTypeFormValues,
    unknown,
    ActivityTypeFormOutput
  >({
    resolver: useZodResolver(
      activityTypeFormSchema,
      "settings.team.activityValidation",
    ),
    defaultValues: {
      name: activityType?.name ?? "",
      colour: activityType?.colour ?? "neutral",
      supportsCallUps: activityType?.supportsCallUps ?? false,
    },
  });

  const pending = createType.isPending || updateType.isPending;
  const saveError = createType.error ?? updateType.error;
  const errorMessage =
    saveError === null
      ? null
      : (saveError.message ?? t("settings.team.activityTypeSaveError"));

  const handleSave = form.handleSubmit(async (data) => {
    if (isEdit) {
      await updateType.mutateAsync({
        activityTypeId: activityType.id,
        name: data.name,
        colour: data.colour,
        supportsCallUps: data.supportsCallUps,
      });
    } else {
      await createType.mutateAsync({
        name: data.name,
        colour: data.colour,
        supportsCallUps: data.supportsCallUps,
      });
    }
    onClose();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("settings.team.editActivityType")
              : t("settings.team.newActivityType")}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.team.name")}</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="colour"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.team.colour")}</FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap gap-2">
                      {ACTIVITY_COLOURS.map((colour) => {
                        const selected = field.value === colour;
                        return (
                          <button
                            key={colour}
                            type="button"
                            aria-pressed={selected}
                            aria-label={t(`activityColour.${colour}`)}
                            onClick={() => field.onChange(colour)}
                            className={cn(
                              "ease-standard flex h-9 items-center gap-2 rounded-pill px-3 text-sm font-semibold transition-colors duration-[120ms]",
                              selected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground hover:bg-accent",
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "size-3.5 rounded-full",
                                ACTIVITY_COLOUR_DOT[colour],
                              )}
                            />
                            {t(`activityColour.${colour}`)}
                          </button>
                        );
                      })}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="supportsCallUps"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-3">
                  <div>
                    <FormLabel>{t("settings.team.supportsCallUps")}</FormLabel>
                    <p className="text-muted-foreground text-sm">
                      {t("settings.team.supportsCallUpsHint")}
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {errorMessage !== null && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("common.close")}
              </Button>
              <Button type="submit" disabled={pending}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
