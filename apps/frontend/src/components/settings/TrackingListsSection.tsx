/** Tracking list definitions. The value type is fixed once created (ADR-014). */
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
import { useZodResolver } from "@/lib/form";
import {
  TRACKING_VALUE_TYPES,
  trackingFormSchema,
  useArchiveTrackingDefinition,
  useCreateTrackingDefinition,
  useTrackingDefinitions,
  useUpdateTrackingDefinition,
  type TrackingFormOutput,
  type TrackingFormValues,
} from "@/lib/tracking";
import { type TrackingDefinition } from "@fc-app/contracts";

export function TrackingLists({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const definitions = useTrackingDefinitions(teamId, true);
  const archiveDefinition = useArchiveTrackingDefinition(teamId);
  const [editing, setEditing] = useState<TrackingDefinition | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl">
            {t("settings.team.tracking")}
          </h2>
          <Button onClick={() => setCreating(true)}>
            {t("settings.team.newTracking")}
          </Button>
        </div>

        {definitions.isPending ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : definitions.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{t("settings.team.loadError")}</AlertDescription>
          </Alert>
        ) : definitions.data.definitions.length === 0 ? (
          <p className="text-muted-foreground">
            {t("settings.team.trackingEmpty")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {definitions.data.definitions.map((definition) => (
              <div
                key={definition.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card p-3"
              >
                <div className="flex items-center gap-2">
                  <p className="font-medium">{definition.name}</p>
                  <Badge variant="secondary">
                    {t(`trackingType.${definition.valueType}`)}
                  </Badge>
                  {definition.archived && (
                    <Badge variant="secondary">
                      {t("settings.team.archived")}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(definition)}
                  >
                    {t("common.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={archiveDefinition.isPending}
                    onClick={() =>
                      archiveDefinition.mutate({
                        definitionId: definition.id,
                        archived: !definition.archived,
                      })
                    }
                  >
                    {definition.archived
                      ? t("settings.team.restore")
                      : t("settings.team.archive")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {archiveDefinition.isError && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>
              {archiveDefinition.error.message ??
                t("settings.team.saveError")}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {creating && (
        <TrackingDialog teamId={teamId} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <TrackingDialog
          teamId={teamId}
          definition={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TrackingDialog({
  teamId,
  definition,
  onClose,
}: {
  teamId: string;
  definition?: TrackingDefinition;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createDefinition = useCreateTrackingDefinition(teamId);
  const updateDefinition = useUpdateTrackingDefinition(teamId);
  const isEdit = definition !== undefined;

  const form = useForm<TrackingFormValues, unknown, TrackingFormOutput>({
    resolver: useZodResolver(trackingFormSchema, "settings.team.validation"),
    defaultValues: {
      name: definition?.name ?? "",
      valueType: definition?.valueType ?? "done",
    },
  });

  const pending = createDefinition.isPending || updateDefinition.isPending;
  const error = createDefinition.error ?? updateDefinition.error;

  const handleSave = form.handleSubmit(async (data) => {
    if (isEdit) {
      await updateDefinition.mutateAsync({
        definitionId: definition.id,
        name: data.name,
      });
    } else {
      await createDefinition.mutateAsync(data);
    }
    onClose();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("settings.team.editTracking")
              : t("settings.team.newTracking")}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.message ?? t("settings.team.saveError")}
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form
            id="tracking-form"
            className="flex flex-col gap-4"
            onSubmit={handleSave}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field: formField }) => (
                <FormItem>
                  <FormLabel>{t("settings.team.name")}</FormLabel>
                  <FormControl>
                    <Input
                      {...formField}
                      autoFocus
                      maxLength={100}
                      placeholder={t("settings.team.trackingPlaceholder")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* The type is fixed once created. Flipping "Grönt kort" from a tick
                to a date would leave every stored tick meaning nothing, and
                there is no honest way to convert them. */}
            {isEdit ? (
              <div className="flex flex-col gap-1.5">
                <Label>{t("settings.team.trackingTypeLabel")}</Label>
                <p className="text-muted-foreground text-sm">
                  {t(`trackingType.${definition.valueType}`)}
                  {" · "}
                  {t("settings.team.trackingTypeFixed")}
                </p>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="valueType"
                render={({ field: formField }) => (
                  <FormItem>
                    <FormLabel>
                      {t("settings.team.trackingTypeLabel")}
                    </FormLabel>
                    <Select
                      value={formField.value}
                      onValueChange={formField.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TRACKING_VALUE_TYPES.map((valueType) => (
                          <SelectItem key={valueType} value={valueType}>
                            {t(`trackingType.${valueType}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </form>
        </Form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button type="submit" form="tracking-form" disabled={pending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
