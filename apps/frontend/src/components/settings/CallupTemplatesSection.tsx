/**
 * Match levels (ADR-028): which players a "Lätt match" wants, read off one
 * development scale. A borderline player is a step the team added to that
 * scale ("Lätt/Medel"), ticked in both slots it may fill.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  slotTotal,
  type CallupSlot,
  type CallupTemplate,
  type DevelopmentMetric,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActivityTypes } from "@/lib/activity-types";
import {
  slotLabel,
  useArchiveCallupTemplate,
  useCallupTemplates,
  useCreateCallupTemplate,
  useUpdateCallupTemplate,
  type CallupTemplateWrite,
} from "@/lib/callup-criteria";
import { labelledSteps, useDevelopmentMetrics } from "@/lib/development";
import { cn } from "@/lib/utils";

/** Radix Select has no empty value, so "every type without call-ups" needs a name. */
const ALL_TRAINING = "__all__";

function asScale(metric: DevelopmentMetric) {
  return {
    metricId: metric.id,
    name: metric.name,
    scaleMin: metric.scaleMin ?? 0,
    scaleMax: metric.scaleMax ?? 0,
    scaleLabels: metric.scaleLabels,
  };
}

export function CallupTemplates({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const templates = useCallupTemplates(teamId, true);
  const metrics = useDevelopmentMetrics(teamId, true);
  const archive = useArchiveCallupTemplate(teamId);
  const [editing, setEditing] = useState<CallupTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const scales = (metrics.data?.metrics ?? []).filter(
    (metric) => metric.valueType === "scale",
  );
  const metricById = new Map(scales.map((metric) => [metric.id, metric]));
  // An archived scale cannot back a new level, so it does not count here.
  const noActiveScale = scales.every((metric) => metric.archived);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display text-xl">
          {t("callupTemplates.heading")}
        </h2>
        <Button
          disabled={noActiveScale}
          onClick={() => setCreating(true)}
        >
          {t("callupTemplates.new")}
        </Button>
      </div>
      <p className="text-muted-foreground mb-3 text-sm">
        {t("callupTemplates.hint")}
      </p>

      {metrics.isSuccess && noActiveScale && (
        <Alert className="mb-3">
          <AlertDescription>{t("callupTemplates.needScale")}</AlertDescription>
        </Alert>
      )}

      {templates.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : templates.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("settings.team.loadError")}</AlertDescription>
        </Alert>
      ) : templates.data.templates.length === 0 ? (
        <p className="text-muted-foreground">{t("callupTemplates.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {templates.data.templates.map((template) => {
            const metric = metricById.get(template.levelMetricId);
            return (
              <div
                key={template.id}
                className="bg-card flex flex-wrap items-center justify-between gap-2 rounded-md p-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{template.name}</p>
                    <span className="text-muted-foreground text-sm">
                      {t("callupTemplates.players", {
                        count: slotTotal(template.slots),
                      })}
                      {template.minAttendanceRate !== null &&
                        ` · ${t("callupTemplates.minRateShort", {
                          rate: template.minAttendanceRate,
                        })}`}
                      {template.minCoachChildren > 0 &&
                        ` · ${t("callupTemplates.coachChildrenShort", {
                          count: template.minCoachChildren,
                        })}`}
                    </span>
                    {template.archived && (
                      <Badge variant="secondary">
                        {t("settings.team.archived")}
                      </Badge>
                    )}
                  </div>
                  {metric && (
                    <p className="text-muted-foreground text-xs">
                      {template.slots
                        .map(
                          (slot) =>
                            `${slot.count} × ${slotLabel(slot, asScale(metric))}`,
                        )
                        .join("  ·  ")}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(template)}
                  >
                    {t("common.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={archive.isPending}
                    onClick={() =>
                      archive.mutate({
                        templateId: template.id,
                        archived: !template.archived,
                      })
                    }
                  >
                    {template.archived
                      ? t("settings.team.restore")
                      : t("settings.team.archive")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <TemplateDialog
          teamId={teamId}
          template={editing ?? undefined}
          scales={scales}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function TemplateDialog({
  teamId,
  template,
  scales,
  onClose,
}: {
  teamId: string;
  template?: CallupTemplate | undefined;
  scales: DevelopmentMetric[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateCallupTemplate(teamId);
  const update = useUpdateCallupTemplate(teamId);
  const activityTypes = useActivityTypes(teamId);

  const firstScale = scales.find((metric) => !metric.archived);
  const [name, setName] = useState(template?.name ?? "");
  const [metricId, setMetricId] = useState(
    template?.levelMetricId ?? firstScale?.id ?? "",
  );
  const [minRate, setMinRate] = useState(
    template?.minAttendanceRate === null || template === undefined
      ? ""
      : String(template.minAttendanceRate),
  );
  const [trainingType, setTrainingType] = useState(
    template?.attendanceActivityTypeId ?? ALL_TRAINING,
  );
  const [coachChildren, setCoachChildren] = useState(
    String(template?.minCoachChildren ?? 1),
  );
  const [slots, setSlots] = useState<CallupSlot[]>(
    template?.slots ?? [{ count: 1, levels: [] }],
  );

  const metric = scales.find((one) => one.id === metricId);
  const steps = metric ? labelledSteps(metric) : [];
  const rate = minRate.trim() === "" ? null : Number(minRate);
  const rateInvalid =
    rate !== null && (!Number.isInteger(rate) || rate < 0 || rate > 100);
  const slotsInvalid = slots.some(
    (slot) => slot.levels.length === 0 || slot.count < 1,
  );
  const coachCount = Number(coachChildren);
  const coachInvalid =
    !Number.isInteger(coachCount) || coachCount < 0 || coachCount > 10;
  const canSave =
    name.trim() !== "" &&
    metric !== undefined &&
    !rateInvalid &&
    !slotsInvalid &&
    !coachInvalid;

  const pending = create.isPending || update.isPending;
  const saveError = create.error ?? update.error;

  const setSlot = (index: number, next: CallupSlot) =>
    setSlots((current) => current.map((slot, i) => (i === index ? next : slot)));

  const toggleLevel = (index: number, level: number) => {
    const slot = slots[index];
    if (!slot) return;
    setSlot(index, {
      ...slot,
      levels: slot.levels.includes(level)
        ? slot.levels.filter((one) => one !== level)
        : [...slot.levels, level].sort((a, b) => a - b),
    });
  };

  const changeMetric = (id: string) => {
    setMetricId(id);
    // Steps belong to a scale; ticks made on the old one mean nothing here.
    setSlots((current) => current.map((slot) => ({ ...slot, levels: [] })));
  };

  const save = async () => {
    const input: CallupTemplateWrite = {
      name: name.trim(),
      levelMetricId: metricId,
      minAttendanceRate: rate,
      attendanceActivityTypeId:
        trainingType === ALL_TRAINING ? null : trainingType,
      slots,
      minCoachChildren: coachCount,
    };
    if (template) {
      await update.mutateAsync({ templateId: template.id, ...input });
    } else {
      await create.mutateAsync(input);
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* The phone sheet scrolls already; on the desktop a long mix would
          otherwise push the title off the top of the screen. Important,
          because cn() does not resolve these against the dialog's own
          `kit:max-h-none` and the stylesheet puts that one last. */}
      <DialogContent className="kit:max-h-[90vh]! kit:overflow-y-auto!">
        <DialogHeader>
          <DialogTitle>
            {template
              ? t("callupTemplates.editTitle")
              : t("callupTemplates.newTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {saveError !== null && (
            <Alert variant="destructive">
              <AlertDescription>
                {saveError.message ?? t("callups.saveError")}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="template-name">{t("callupTemplates.name")}</Label>
            <Input
              id="template-name"
              value={name}
              autoFocus
              maxLength={100}
              placeholder={t("callupTemplates.namePlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("callupTemplates.levelMetric")}</Label>
            <Select value={metricId} onValueChange={changeMetric}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scales
                  .filter((one) => !one.archived || one.id === metricId)
                  .map((one) => (
                    <SelectItem key={one.id} value={one.id}>
                      {one.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 kit:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="template-rate">
                {t("callupTemplates.minRate")}
              </Label>
              <Input
                id="template-rate"
                inputMode="numeric"
                value={minRate}
                placeholder={t("callupTemplates.minRateNone")}
                aria-invalid={rateInvalid}
                onChange={(event) => setMinRate(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("callupTemplates.trainingType")}</Label>
              <Select value={trainingType} onValueChange={setTrainingType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TRAINING}>
                    {t("callupTemplates.allTraining")}
                  </SelectItem>
                  {(activityTypes.data?.activityTypes ?? []).map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="template-coach-children">
              {t("callupTemplates.coachChildren")}
            </Label>
            <Input
              id="template-coach-children"
              inputMode="numeric"
              className="w-24"
              value={coachChildren}
              aria-invalid={coachInvalid}
              onChange={(event) => setCoachChildren(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {t("callupTemplates.coachChildrenHint")}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("callupTemplates.slots")}</Label>
            <p className="text-muted-foreground text-xs">
              {t("callupTemplates.slotsHint")}
            </p>
            {slots.map((slot, index) => (
              <div
                key={index}
                className="bg-secondary flex flex-col gap-2 rounded-md p-3"
              >
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={t("callupTemplates.count")}
                    inputMode="numeric"
                    className="w-20"
                    value={String(slot.count)}
                    onChange={(event) =>
                      setSlot(index, {
                        ...slot,
                        count: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                  />
                  <span className="text-sm">
                    {t("callupTemplates.playersOf")}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    disabled={slots.length === 1}
                    onClick={() =>
                      setSlots((current) => current.filter((_, i) => i !== index))
                    }
                  >
                    {t("common.delete")}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {steps.map(({ step, label }) => {
                    const on = slot.levels.includes(step);
                    return (
                      <button
                        key={step}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleLevel(index, step)}
                        className={cn(
                          "rounded-pill px-3 py-1 text-sm font-semibold transition-colors duration-[120ms] ease-standard",
                          on
                            ? "bg-ink text-white"
                            : "bg-card border-2 border-dashed border-[var(--border-dashed)] text-[var(--neutral-650)]",
                        )}
                      >
                        {label ?? step}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={slots.length >= 20}
              onClick={() =>
                setSlots((current) => [...current, { count: 1, levels: [] }])
              }
            >
              {t("callupTemplates.addSlot")}
            </Button>
            <p className="text-muted-foreground text-sm">
              {t("callupTemplates.players", { count: slotTotal(slots) })}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button disabled={!canSave || pending} onClick={save}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
