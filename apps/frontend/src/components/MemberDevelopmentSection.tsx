/** A member's development over time (#96) on the member detail page. */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DevelopmentAssessment, DevelopmentMetric } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DevelopmentAssessmentDialog } from "@/components/DevelopmentAssessmentDialog";
import { formatDateLong, SEPARATOR, useDateLocale } from "@/lib/dates";
import {
  CHART_VIEW_BOX,
  chartBounds,
  formatMetricNumber,
  isChartable,
  latestAndDelta,
  polylinePoints,
  seriesForMetric,
  sparklinePoints,
  useDeleteDevelopmentAssessment,
  useMemberDevelopment,
} from "@/lib/development";
import { cn } from "@/lib/utils";

export function MemberDevelopmentSection({
  teamId,
  memberId,
}: {
  teamId: string;
  memberId: string;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const development = useMemberDevelopment(teamId, memberId);
  const deleteAssessment = useDeleteDevelopmentAssessment(teamId);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DevelopmentAssessment | null>(null);

  if (development.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("development.loadError")}</AlertDescription>
      </Alert>
    );
  }
  if (development.isPending) return null;

  const { metrics, assessments } = development.data;

  // A retired metric earns a card only when this member has something recorded
  // against it; otherwise it is just noise on their page.
  const shown = metrics.filter(
    (metric) =>
      !metric.archived ||
      assessments.some((assessment) =>
        assessment.values.some((value) => value.metricId === metric.id),
      ),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">{t("development.heading")}</h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          {t("development.newAssessment")}
        </Button>
      </div>

      {metrics.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("development.noMetricsHint")}
        </p>
      ) : assessments.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("development.empty")}
        </p>
      ) : (
        <>
          <div className="grid gap-[11px] sm:grid-cols-2">
            {shown.map((metric) => (
              <MetricCard
                key={metric.id}
                metric={metric}
                assessments={assessments}
              />
            ))}
          </div>

          <h3 className="kit-overline mt-3">{t("development.occasions")}</h3>
          <div className="flex flex-col gap-[11px]">
            {assessments.map((assessment) => (
              <div
                key={assessment.id}
                className="bg-card flex flex-col gap-2 rounded-md px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {formatDateLong(
                      `${assessment.assessedOn}T00:00:00Z`,
                      locale,
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs font-semibold">
                      {assessment.createdByName ?? t("development.someone")}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(assessment)}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deleteAssessment.isPending}
                      onClick={() =>
                        deleteAssessment.mutate({ assessmentId: assessment.id })
                      }
                    >
                      {t("common.delete")}
                    </Button>
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {assessment.values.map((value) => {
                    const metric = metrics.find(
                      (candidate) => candidate.id === value.metricId,
                    );
                    if (!metric) return null;
                    return (
                      <span key={value.metricId}>
                        <span className="text-muted-foreground">
                          {metric.name}
                        </span>{" "}
                        <span className="font-semibold">
                          {readingLabel(metric, value.number, value.text, t)}
                        </span>
                      </span>
                    );
                  })}
                </div>

                {assessment.note && (
                  <p className="text-muted-foreground text-sm">
                    {assessment.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {deleteAssessment.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {deleteAssessment.error.message ?? t("development.saveError")}
          </AlertDescription>
        </Alert>
      )}

      {creating && (
        <DevelopmentAssessmentDialog
          teamId={teamId}
          memberId={memberId}
          metrics={metrics}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <DevelopmentAssessmentDialog
          teamId={teamId}
          memberId={memberId}
          metrics={metrics}
          assessment={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

type Translate = (key: string) => string;

/** How one stored reading reads on screen. */
function readingLabel(
  metric: DevelopmentMetric,
  number: number | null,
  text: string | null,
  t: Translate,
): string {
  if (number !== null) return formatMetricNumber(metric, number);
  if (metric.valueType === "boolean") {
    return text === "true" ? t("common.yes") : t("common.no");
  }
  return text ?? "";
}

/**
 * One metric's history. A numeric metric gets its latest reading, how it moved,
 * and a sparkline; a note or a tick has nothing to plot and gets a dated list
 * instead.
 */
function MetricCard({
  metric,
  assessments,
}: {
  metric: DevelopmentMetric;
  assessments: DevelopmentAssessment[];
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  if (!isChartable(metric.valueType)) {
    const readings = assessments.flatMap((assessment) => {
      const value = assessment.values.find(
        (candidate) => candidate.metricId === metric.id,
      );
      return value
        ? [{ assessedOn: assessment.assessedOn, value }]
        : [];
    });
    if (readings.length === 0) return null;

    return (
      <Card metric={metric}>
        <div className="flex flex-col gap-1.5">
          {readings.map((reading) => (
            <div
              key={reading.assessedOn}
              className="flex items-baseline gap-3 text-sm"
            >
              {/* A recorded value has been decided, so it gets a solid disc;
                  a dashed ring would say nobody had said yet (DDR-006). */}
              {metric.valueType === "boolean" ? (
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    reading.value.text === "true"
                      ? "bg-brand text-white"
                      : "bg-[var(--neutral-150)] text-[var(--neutral-650)]",
                  )}
                >
                  {reading.value.text === "true" ? "✓" : ""}
                </span>
              ) : null}
              <span className="text-muted-foreground shrink-0 text-xs font-semibold">
                {formatDateLong(`${reading.assessedOn}T00:00:00Z`, locale)}
              </span>
              {metric.valueType !== "boolean" && (
                <span className="min-w-0">{reading.value.text}</span>
              )}
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const series = seriesForMetric(metric, assessments);
  const reading = latestAndDelta(series, metric.higherIsBetter);
  if (!reading) return null;

  const points = sparklinePoints(series, chartBounds(metric));

  return (
    <Card metric={metric}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">
            {formatMetricNumber(metric, reading.latest.value)}
          </span>
          {reading.delta !== null && reading.delta !== 0 && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                reading.improved
                  ? "bg-[var(--green-050)] text-[var(--green-600)]"
                  : "bg-[var(--neutral-150)] text-[var(--neutral-650)]",
              )}
            >
              {reading.delta > 0 ? "+" : ""}
              {Number(reading.delta.toFixed(2))}
            </span>
          )}
        </div>
        <span className="text-muted-foreground text-xs">
          {[
            formatDateLong(`${reading.latest.assessedOn}T00:00:00Z`, locale),
            t("development.readings", { count: series.length }),
          ].join(SEPARATOR)}
        </span>
      </div>

      {/* A single reading is a number, not a trend — drawing a line through one
          point would suggest a history that is not there. */}
      {series.length > 1 && (
        <svg
          viewBox={CHART_VIEW_BOX}
          // Stretches to the card's width on any shell, which is what the
          // phone needs (DDR-010); the stroke is kept from stretching with it.
          preserveAspectRatio="none"
          className="mt-2 h-10 w-full"
          role="img"
          aria-label={t("development.trendLabel", {
            metric: metric.name,
            from: series[0]!.value,
            to: series.at(-1)!.value,
          })}
        >
          <polyline
            points={polylinePoints(points)}
            fill="none"
            stroke="var(--green-500)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {points.map((point, index) => (
            <circle
              key={series[index]!.assessedOn}
              cx={point.x}
              cy={point.y}
              r="2"
              fill="var(--green-500)"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}
    </Card>
  );
}

function Card({
  metric,
  children,
}: {
  metric: DevelopmentMetric;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-card flex flex-col rounded-md px-4 py-3">
      <span className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-semibold">{metric.name}</span>
        {metric.archived && (
          <Badge variant="secondary">{t("settings.team.archived")}</Badge>
        )}
      </span>
      {children}
    </div>
  );
}
