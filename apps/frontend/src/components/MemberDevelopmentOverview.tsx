/**
 * The squad's follow-up: each member's latest assessment, side by side.
 *
 * The member page has one child's whole history; this is the other question a
 * coach asks — where does everyone stand, and who has not been looked at in a
 * while. So it shows only the newest assessment per member, and a member who
 * has never been assessed says so rather than disappearing.
 *
 * Same shapes as the list: a table on the desktop, grouped the same way, and a
 * row per member on the phone. A row leads to the member, where the history is.
 */
import { Fragment } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type {
  DevelopmentAssessment,
  DevelopmentMetric,
  DevelopmentValue,
  Member,
} from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
    development.data.latest.map((assessment) => [assessment.memberId, assessment]),
  );
  const dateOf = (assessment: DevelopmentAssessment | undefined): string =>
    assessment
      ? formatDateLong(`${assessment.assessedOn}T00:00:00Z`, locale)
      : t("members.neverAssessed");

  const tableSections: MemberSection[] = sections ?? [
    { groupId: null, name: "", members },
  ];

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
                <Link
                  key={member.id}
                  to="/members/$memberId"
                  params={{ memberId: member.id }}
                  className="bg-card hover:bg-secondary flex flex-col gap-2 rounded-lg px-4 py-3 transition-colors duration-[120ms] ease-standard"
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
                          <dt className="text-muted-foreground">{metric.name}</dt>
                          <dd>
                            <Reading metric={metric} assessment={latest} />
                          </dd>
                        </Fragment>
                      ))}
                    </dl>
                  )}
                </Link>
              );
            })}
          </Fragment>
        ))}
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableSections.map((section) => (
            <Fragment key={section.groupId ?? "ungrouped"}>
              {sections !== null && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={2 + metrics.length}
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
                    onClick={() =>
                      navigate({
                        to: "/members/$memberId",
                        params: { memberId: member.id },
                      })
                    }
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
                  </TableRow>
                );
              })}
            </Fragment>
          ))}
        </TableBody>
      </Table>
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
