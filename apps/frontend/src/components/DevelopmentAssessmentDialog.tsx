/**
 * One assessment occasion: a member, a day, and every metric filled in at once.
 *
 * Saved in a single write (ADR-019). This is the attendance case rather than the
 * tracking-matrix case — a coach sits down with one player and fills a form in,
 * so a request per field would buy nothing and lose the "these were measured
 * together" grouping that makes the history readable.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DevelopmentAssessment, DevelopmentMetric } from "@fc-app/contracts";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toDateInput } from "@/lib/dates";
import { labelledSteps, useSaveDevelopmentAssessment } from "@/lib/development";
import { cn } from "@/lib/utils";

/** The raw string each metric's control holds, keyed by metric id. */
type Draft = Record<string, string>;

/** Turns a saved assessment back into the strings its controls hold. */
function draftFrom(
  metrics: DevelopmentMetric[],
  assessment: DevelopmentAssessment | undefined,
): Draft {
  const draft: Draft = {};
  for (const metric of metrics) {
    const value = assessment?.values.find(
      (candidate) => candidate.metricId === metric.id,
    );
    draft[metric.id] =
      value === undefined
        ? ""
        : value.number !== null
          ? String(value.number)
          : (value.text ?? "");
  }
  return draft;
}

export function DevelopmentAssessmentDialog({
  teamId,
  memberId,
  metrics,
  assessment,
  onClose,
}: {
  teamId: string;
  memberId: string;
  /** Every metric the team has, archived included. */
  metrics: DevelopmentMetric[];
  /** Present when correcting an occasion rather than recording a new one. */
  assessment?: DevelopmentAssessment;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveDevelopmentAssessment(teamId);

  /**
   * A retired metric is only worth a field if this occasion already has a value
   * against it — otherwise the form would keep asking something the team has
   * stopped asking (ADR-014).
   */
  const visible = metrics.filter(
    (metric) =>
      !metric.archived ||
      assessment?.values.some((value) => value.metricId === metric.id),
  );

  const [assessedOn, setAssessedOn] = useState(
    assessment?.assessedOn ?? toDateInput(new Date()),
  );
  const [note, setNote] = useState(assessment?.note ?? "");
  const [draft, setDraft] = useState<Draft>(() =>
    draftFrom(visible, assessment),
  );

  const set = (metricId: string, value: string) =>
    setDraft((current) => ({ ...current, [metricId]: value }));

  const handleSave = async () => {
    await save.mutateAsync({
      memberId,
      assessedOn,
      note: note.trim() === "" ? null : note.trim(),
      // An empty control means "not measured", which clears any stored row
      // rather than writing a zero (DDR-006).
      values: visible.map((metric) => ({
        metricId: metric.id,
        value: draft[metric.id]?.trim() === "" ? null : (draft[metric.id] ?? null),
      })),
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {assessment
              ? t("development.editAssessment")
              : t("development.newAssessment")}
          </DialogTitle>
        </DialogHeader>

        {save.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {save.error.message ?? t("development.saveError")}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assessed-on">{t("development.date")}</Label>
            <Input
              id="assessed-on"
              type="date"
              value={assessedOn}
              onChange={(event) => setAssessedOn(event.target.value)}
            />
          </div>

          {visible.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("development.noMetrics")}
            </p>
          ) : (
            visible.map((metric) => (
              <MetricField
                key={metric.id}
                metric={metric}
                value={draft[metric.id] ?? ""}
                onChange={(value) => set(metric.id, value)}
              />
            ))
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assessment-note">{t("development.note")}</Label>
            <Textarea
              id="assessment-note"
              value={note}
              maxLength={2000}
              rows={3}
              placeholder={t("development.notePlaceholder")}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            type="button"
            disabled={save.isPending || visible.length === 0}
            onClick={handleSave}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One metric's control, chosen by its type. */
function MetricField({
  metric,
  value,
  onChange,
}: {
  metric: DevelopmentMetric;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const label = (
    <span className="flex flex-wrap items-center gap-2">
      {metric.name}
      {metric.unit && (
        <span className="text-muted-foreground text-xs">({metric.unit})</span>
      )}
    </span>
  );

  if (metric.valueType === "scale") {
    const steps = labelledSteps(metric);
    const named = metric.scaleLabels.length > 0;

    return (
      <div className="flex flex-col gap-1.5">
        <Label>{label}</Label>
        {/* Named steps stack: "Extra svår" beside four siblings would wrap into
            an unreadable hedge on a phone, and the name is the thing being
            chosen. Bare numbers stay a compact row. */}
        <div
          className={cn(named ? "flex flex-col gap-1.5" : "flex flex-wrap gap-1.5")}
          role="group"
        >
          {steps.map(({ step, label: stepLabel }) => {
            const selected = value === String(step);
            return (
              <button
                key={step}
                type="button"
                aria-pressed={selected}
                // Tapping the chosen step again clears it, which is the only
                // way back to "not measured" once something is picked.
                onClick={() => onChange(selected ? "" : String(step))}
                className={cn(
                  "rounded-md text-sm font-semibold transition-colors",
                  named
                    ? "flex h-9 items-center gap-3 px-3 text-left"
                    : "h-9 min-w-9 px-2",
                  selected
                    ? "bg-brand text-white"
                    : "bg-[var(--neutral-150)] text-[var(--neutral-650)] hover:bg-[var(--neutral-200)]",
                )}
              >
                <span className={cn(named && "w-4 shrink-0 opacity-70")}>
                  {step}
                </span>
                {stepLabel && <span className="min-w-0">{stepLabel}</span>}
              </button>
            );
          })}
          {value !== "" && (
            <button
              type="button"
              className={cn(
                "text-muted-foreground text-sm underline",
                named ? "self-start py-1" : "h-9 px-2",
              )}
              onClick={() => onChange("")}
            >
              {t("development.clear")}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (metric.valueType === "number") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`metric-${metric.id}`}>{label}</Label>
        <Input
          id={`metric-${metric.id}`}
          // `inputMode` rather than `type="number"`: a Swedish keyboard types a
          // decimal comma, which a number input silently discards.
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }

  if (metric.valueType === "boolean") {
    return (
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={`metric-${metric.id}`}>{label}</Label>
        <div className="flex items-center gap-3">
          <Switch
            id={`metric-${metric.id}`}
            checked={value === "true"}
            onCheckedChange={(checked) => onChange(checked ? "true" : "false")}
          />
          {value !== "" && (
            <button
              type="button"
              className="text-muted-foreground text-sm underline"
              onClick={() => onChange("")}
            >
              {t("development.clear")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`metric-${metric.id}`}>{label}</Label>
      <Textarea
        id={`metric-${metric.id}`}
        value={value}
        rows={2}
        maxLength={1000}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
