/**
 * Development metric definitions. The value type and a scale's range are fixed
 * once created (ADR-014) — see the note in the dialog for why.
 */
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
  FormDescription,
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
import {
  DEVELOPMENT_VALUE_TYPES,
  MAX_SCALE_SPAN,
  metricFormSchema,
  metricFormToInput,
  useArchiveDevelopmentMetric,
  useCreateDevelopmentMetric,
  useDevelopmentMetrics,
  useUpdateDevelopmentMetric,
  validateMetricDefinition,
} from "@/lib/development";
import { type DevelopmentMetric } from "@fc-app/contracts";
import type { z } from "zod";

type MetricFormValues = z.input<typeof metricFormSchema>;
type MetricFormOutput = z.output<typeof metricFormSchema>;

export function DevelopmentMetrics({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const metrics = useDevelopmentMetrics(teamId, true);
  const archiveMetric = useArchiveDevelopmentMetric(teamId);
  const [editing, setEditing] = useState<DevelopmentMetric | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-xl">
            {t("settings.team.development")}
          </h2>
          <Button onClick={() => setCreating(true)}>
            {t("settings.team.newMetric")}
          </Button>
        </div>
        <p className="text-muted-foreground mb-3 text-sm">
          {t("settings.team.developmentHint")}
        </p>

        {metrics.isPending ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : metrics.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{t("settings.team.loadError")}</AlertDescription>
          </Alert>
        ) : metrics.data.metrics.length === 0 ? (
          <p className="text-muted-foreground">
            {t("settings.team.developmentEmpty")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {metrics.data.metrics.map((metric) => (
              <div
                key={metric.id}
                className="bg-card flex flex-wrap items-center justify-between gap-2 rounded-md p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{metric.name}</p>
                  <Badge variant="secondary">
                    {t(`developmentType.${metric.valueType}`)}
                  </Badge>
                  {metric.valueType === "scale" && (
                    <span className="text-muted-foreground text-sm">
                      {metric.scaleMin}–{metric.scaleMax}
                      {/* Ends only: enough to recognise the scale without the
                          row growing to the width of every step's name. */}
                      {metric.scaleLabels.length > 0 &&
                        ` · ${metric.scaleLabels[0]} … ${metric.scaleLabels.at(-1)}`}
                    </span>
                  )}
                  {metric.unit && (
                    <span className="text-muted-foreground text-sm">
                      {metric.unit}
                    </span>
                  )}
                  {/* Only worth saying when it is the surprising direction. */}
                  {!metric.higherIsBetter && (
                    <Badge variant="secondary">
                      {t("settings.team.lowerIsBetter")}
                    </Badge>
                  )}
                  {metric.archived && (
                    <Badge variant="secondary">
                      {t("settings.team.archived")}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(metric)}
                  >
                    {t("common.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={archiveMetric.isPending}
                    onClick={() =>
                      archiveMetric.mutate({
                        metricId: metric.id,
                        archived: !metric.archived,
                      })
                    }
                  >
                    {metric.archived
                      ? t("settings.team.restore")
                      : t("settings.team.archive")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {archiveMetric.isError && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>
              {archiveMetric.error.message ?? t("settings.team.saveError")}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {creating && (
        <MetricDialog teamId={teamId} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <MetricDialog
          teamId={teamId}
          metric={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function MetricDialog({
  teamId,
  metric,
  onClose,
}: {
  teamId: string;
  metric?: DevelopmentMetric;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createMetric = useCreateDevelopmentMetric(teamId);
  const updateMetric = useUpdateDevelopmentMetric(teamId);
  const isEdit = metric !== undefined;
  const [shapeError, setShapeError] = useState<string | null>(null);

  const form = useForm<MetricFormValues, unknown, MetricFormOutput>({
    resolver: useZodResolver(metricFormSchema, "settings.team.validation"),
    defaultValues: {
      name: metric?.name ?? "",
      valueType: metric?.valueType ?? "scale",
      unit: metric?.unit ?? "",
      scaleMin: metric?.scaleMin ?? 1,
      scaleMax: metric?.scaleMax ?? 5,
      scaleLabels: metric?.scaleLabels ?? [],
      higherIsBetter: metric?.higherIsBetter ?? true,
    },
  });

  const valueType = form.watch("valueType");
  const scaleMin = form.watch("scaleMin");
  const scaleMax = form.watch("scaleMax");

  /**
   * One box per step of the current range. Editing a bound while creating
   * re-sizes the list, keeping whatever names were already typed against the
   * steps they belong to.
   */
  const steps =
    valueType === "scale" && Number.isInteger(scaleMin) &&
    Number.isInteger(scaleMax) && scaleMax > scaleMin &&
    scaleMax - scaleMin <= MAX_SCALE_SPAN
      ? Array.from({ length: scaleMax - scaleMin + 1 }, (_, i) => scaleMin + i)
      : [];
  const pending = createMetric.isPending || updateMetric.isPending;
  const error = createMetric.error ?? updateMetric.error;

  const handleSave = form.handleSubmit(async (data) => {
    // Trim the names to the range actually in force, padding any the user left
    // untouched. Editing a bound mid-form otherwise leaves orphans behind the
    // end of the scale, and a half-named scale should fail as "name them all"
    // rather than as a length mismatch.
    const named = steps.map((_, index) => data.scaleLabels[index] ?? "");
    const input = metricFormToInput({ ...data, scaleLabels: named });

    // The same cross-field rule the handler runs (ADR-010), so an impossible
    // combination is refused before it becomes a round trip.
    const shape = validateMetricDefinition(input);
    if (!shape.ok) {
      setShapeError(shape.error);
      return;
    }
    setShapeError(null);

    if (isEdit) {
      await updateMetric.mutateAsync({
        metricId: metric.id,
        name: input.name,
        unit: input.unit,
        scaleLabels: input.scaleLabels,
        higherIsBetter: input.higherIsBetter,
      });
    } else {
      await createMetric.mutateAsync(input);
    }
    onClose();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("settings.team.editMetric")
              : t("settings.team.newMetric")}
          </DialogTitle>
        </DialogHeader>

        {(error ?? shapeError) && (
          <Alert variant="destructive">
            <AlertDescription>
              {shapeError ?? error?.message ?? t("settings.team.saveError")}
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form
            id="metric-form"
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
                      placeholder={t("settings.team.metricPlaceholder")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* The type and a scale's range are fixed once created. Narrowing
                1–10 to 1–5 would leave stored 8s outside their own metric, and
                flipping the type would leave every stored value meaning
                nothing — there is no honest way to convert either. */}
            {isEdit ? (
              <div className="flex flex-col gap-1.5">
                <Label>{t("settings.team.metricTypeLabel")}</Label>
                <p className="text-muted-foreground text-sm">
                  {t(`developmentType.${metric.valueType}`)}
                  {metric.valueType === "scale" &&
                    ` (${metric.scaleMin}–${metric.scaleMax})`}
                  {" · "}
                  {t("settings.team.metricTypeFixed")}
                </p>
              </div>
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="valueType"
                  render={({ field: formField }) => (
                    <FormItem>
                      <FormLabel>{t("settings.team.metricTypeLabel")}</FormLabel>
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
                          {DEVELOPMENT_VALUE_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {t(`developmentType.${type}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {valueType === "scale" && (
                  <div className="flex gap-4">
                    <FormField
                      control={form.control}
                      name="scaleMin"
                      render={({ field: formField }) => (
                        <FormItem className="flex-1">
                          <FormLabel>{t("settings.team.scaleMin")}</FormLabel>
                          <FormControl>
                            <Input
                              {...formField}
                              type="number"
                              onChange={(event) =>
                                formField.onChange(event.target.valueAsNumber)
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="scaleMax"
                      render={({ field: formField }) => (
                        <FormItem className="flex-1">
                          <FormLabel>{t("settings.team.scaleMax")}</FormLabel>
                          <FormControl>
                            <Input
                              {...formField}
                              type="number"
                              onChange={(event) =>
                                formField.onChange(event.target.valueAsNumber)
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </>
            )}

            {/* Names for the steps, so 1–5 can read "Extra lätt … Extra
                svår". Editable even on an existing metric: renaming a step
                leaves every stored value exactly as true as it was, which is
                what separates this from the range itself. */}
            {valueType === "scale" && steps.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>{t("settings.team.scaleLabels")}</Label>
                <p className="text-muted-foreground text-sm">
                  {t("settings.team.scaleLabelsHint")}
                </p>
                <div className="flex flex-col gap-2">
                  {steps.map((step, index) => (
                    <FormField
                      key={step}
                      control={form.control}
                      name={`scaleLabels.${index}`}
                      render={({ field: formField }) => (
                        <FormItem className="flex items-center gap-3">
                          <span className="text-muted-foreground w-6 shrink-0 text-sm font-semibold">
                            {step}
                          </span>
                          <FormControl>
                            <Input
                              {...formField}
                              value={formField.value ?? ""}
                              maxLength={60}
                              placeholder={t(
                                "settings.team.scaleLabelPlaceholder",
                              )}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>
            )}

            {valueType === "number" && (
              <FormField
                control={form.control}
                name="unit"
                render={({ field: formField }) => (
                  <FormItem>
                    <FormLabel>{t("settings.team.unit")}</FormLabel>
                    <FormControl>
                      <Input
                        {...formField}
                        maxLength={20}
                        placeholder={t("settings.team.unitPlaceholder")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Only meaningful for something with an order to it. */}
            {(valueType === "scale" || valueType === "number") && (
              <FormField
                control={form.control}
                name="higherIsBetter"
                render={({ field: formField }) => (
                  <FormItem className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <FormLabel>
                        {t("settings.team.higherIsBetterLabel")}
                      </FormLabel>
                      <FormDescription>
                        {t("settings.team.higherIsBetterHint")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={formField.value}
                        onCheckedChange={formField.onChange}
                      />
                    </FormControl>
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
          <Button type="submit" form="metric-form" disabled={pending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
