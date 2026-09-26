/**
 * The squad's follow-up: each member's latest assessment, side by side.
 *
 * The member page has one child's whole history; this is the other question a
 * coach asks — where does everyone stand, and who has not been looked at in a
 * while. So it shows only the newest assessment per member, and a member who
 * has never been assessed says so rather than disappearing.
 *
 * Same shapes as the list: a table on the desktop, grouped the same way, and a
 * row per member on the phone.
 *
 * Everything happens in place, in the same dialog the member page uses — going
 * through the squad one by one should not mean leaving the list and coming
 * back for every child. A row opens its latest assessment, or a new one for a
 * member never assessed; its `…` holds that same edit, a new assessment and
 * the way to the member's history.
 */
import { Fragment, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type {
  DevelopmentAssessment,
  DevelopmentMetric,
  DevelopmentValue,
  Member,
} from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DevelopmentAssessmentDialog } from "@/components/DevelopmentAssessmentDialog";
import { RowActions } from "@/components/RowActions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateLong, useDateLocale } from "@/lib/dates";
import { readingLabel, useTeamDevelopment } from "@/lib/development";
import type { MemberSection } from "@/lib/member-grouping";
import { formatMemberName } from "@/lib/members";

export function MemberDevelopmentOverview({
  compact,
  teamId,
  members,
  sections,
}: {
  /** Phone shape: a row per member instead of a members × metrics table. */
  compact: boolean;
  teamId: string;
  /** Already narrowed by the page's search and group filter. */
  members: Member[];
  sections: MemberSection[] | null;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const navigate = useNavigate();
  const development = useTeamDevelopment(teamId);
  /** The open dialog: whose, and the occasion when correcting one. */
  const [assessing, setAssessing] = useState<{
    member: Member;
    assessment?: DevelopmentAssessment | undefined;
  } | null>(null);

  if (development.isPending) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }
  if (development.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("development.loadError")}</AlertDescription>
      </Alert>
    );
  }

  // Columns are what the team measures now. An archived metric's value on a
  // latest assessment is still history, and the member page shows it.
  const metrics = development.data.metrics.filter((metric) => !metric.archived);
  if (metrics.length === 0) {
    return <p className="text-muted-foreground">{t("members.noMetrics")}</p>;
  }

  const latestByMember = new Map(
    development.data.latest.map((assessment) => [
      assessment.memberId,
      assessment,
    ]),
  );
  const dateOf = (assessment: DevelopmentAssessment | undefined): string =>
    assessment
      ? formatDateLong(`${assessment.assessedOn}T00:00:00Z`, locale)
      : t("members.neverAssessed");

  const tableSections: MemberSection[] = sections ?? [
    { groupId: null, name: "", members },
  ];

  const open = (member: Member) =>
    setAssessing({ member, assessment: latestByMember.get(member.id) });

  const actions = (member: Member) => {
    const latest = latestByMember.get(member.id);
    return (
      <RowActions
        compact={compact}
        title={formatMemberName(member)}
        label={t("development.actionsFor", { name: formatMemberName(member) })}
        actions={[
          // The same as clicking the row, but a menu that lists what a row can
          // do should not leave out the thing it does most.
          ...(latest
            ? [
                {
                  label: t("development.editAssessment"),
                  onSelect: () => setAssessing({ member, assessment: latest }),
                },
              ]
            : []),
          {
            label: t("development.newAssessment"),
            onSelect: () => setAssessing({ member }),
          },
          {
            label: t("development.openHistory"),
            onSelect: () =>
              navigate({
                to: "/members/$memberId",
                params: { memberId: member.id },
              }),
          },
        ]}
      />
    );
  };

  const dialog = assessing && (
    <DevelopmentAssessmentDialog
      teamId={teamId}
      memberId={assessing.member.id}
      memberName={formatMemberName(assessing.member)}
      metrics={development.data.metrics}
      assessment={assessing.assessment}
      onClose={() => setAssessing(null)}
    />
  );

  if (compact) {
    return (
      <div className="flex flex-col gap-[11px]">
        {tableSections.map((section) => (
          <Fragment key={section.groupId ?? "ungrouped"}>
            {sections !== null && (
              <p className="kit-overline text-muted-foreground mt-2">
                {section.name} ({section.members.length})
              </p>
            )}
            {section.members.map((member) => {
              const latest = latestByMember.get(member.id);
              return (
                // A button cannot hold a button, so the card is the row and
                // the open button fills everything but the `…`.
                <div
                  key={member.id}
                  className="bg-card hover:bg-secondary flex items-start gap-1 rounded-lg pr-1 transition-colors duration-[120ms] ease-standard"
                >
                  <button
                    type="button"
                    onClick={() => open(member)}
                    className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3 text-left"
                  >
                    <span className="flex flex-col">
                      <span className="truncate font-semibold">
                        {formatMemberName(member)}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {dateOf(latest)}
                      </span>
                    </span>
                    {latest && (
                      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-sm">
                        {metrics.map((metric) => (
                          <Fragment key={metric.id}>
                            <dt className="text-muted-foreground">
                              {metric.name}
                            </dt>
                            <dd>
                              <Reading metric={metric} assessment={latest} />
                            </dd>
                          </Fragment>
                        ))}
                      </dl>
                    )}
                  </button>
                  <div className="pt-1">{actions(member)}</div>
                </div>
              );
            })}
          </Fragment>
        ))}
        {dialog}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card px-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("members.name")}</TableHead>
            <TableHead>{t("members.lastAssessed")}</TableHead>
            {metrics.map((metric) => (
              <TableHead key={metric.id}>{metric.name}</TableHead>
            ))}
            <TableHead>
              <span className="sr-only">{t("development.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableSections.map((section) => (
            <Fragment key={section.groupId ?? "ungrouped"}>
              {sections !== null && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={3 + metrics.length}
                    className="kit-overline text-muted-foreground pt-6"
                  >
                    {section.name} ({section.members.length})
                  </TableCell>
                </TableRow>
              )}
              {section.members.map((member) => {
                const latest = latestByMember.get(member.id);
                return (
                  <TableRow
                    key={member.id}
                    className="cursor-pointer"
                    onClick={() => open(member)}
                  >
                    <TableCell>{formatMemberName(member)}</TableCell>
                    <TableCell
                      className={latest ? undefined : "text-muted-foreground"}
                    >
                      {dateOf(latest)}
                    </TableCell>
                    {metrics.map((metric) => (
                      <TableCell key={metric.id}>
                        <Reading metric={metric} assessment={latest} />
                      </TableCell>
                    ))}
                    <TableCell className="w-0 py-1 text-right">
                      {actions(member)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </Fragment>
          ))}
        </TableBody>
      </Table>
      {dialog}
    </div>
  );
}

/**
 * One metric at the latest assessment. A yes/no reads as the same coloured
 * pill as a yes/no field on the list; not measured that day is a dash, never
 * a "no" (DDR-006).
 */
function Reading({
  metric,
  assessment,
}: {
  metric: DevelopmentMetric;
  assessment: DevelopmentAssessment | undefined;
}) {
  const { t } = useTranslation();
  const value: DevelopmentValue | undefined = assessment?.values.find(
    (candidate) => candidate.metricId === metric.id,
  );
  if (!value) return <>—</>;

  const label = readingLabel(metric, value.number, value.text, t);
  if (metric.valueType === "boolean") {
    return (
      <Badge variant={value.text === "true" ? "present" : "absent"}>
        {label}
      </Badge>
    );
  }
  return <>{label}</>;
}
