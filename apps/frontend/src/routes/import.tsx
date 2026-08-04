/**
 * Importing a roster from a SportAdmin export (#63).
 *
 * Its own page rather than a tab on the roster: the wizard owns the screen for
 * several steps, a half-finished import must not look like the roster, and a
 * one-off this consequential belongs somewhere you go on purpose. Requires
 * `members.import`, which only Admin holds by default.
 *
 * Nothing here writes. Step three is a dry run; committing arrives in #64.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
// The browser build specifically: the package has no root export, and the Node
// one would drag filesystem code into the bundle. `readSheet` rather than the
// default export — since v9 that returns a list of *sheets*, not rows.
import { readSheet } from "read-excel-file/browser";
import type { ImportRowResult } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import {
  useCommitMemberImport,
  usePreviewMemberImport,
} from "../lib/member-import";
import {
  parseSheet,
  toImportRows,
  type ColumnPlan,
  type ColumnTarget,
  type ParsedSheet,
} from "../lib/sportadmin";

export const Route = createFileRoute("/import")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: ImportPage,
});

/** Targets a column can be pointed at, as one flat list for the picker. */
const TARGET_OPTIONS: { value: string; target: ColumnTarget }[] = [
  { value: "skip", target: { kind: "skip" } },
  ...(
    [
      "firstName",
      "lastName",
      "personalId",
      "externalRef",
      "email",
      "phoneMobile",
      "phoneHome",
      "phoneWork",
      "group",
      "teamName",
    ] as const
  ).map((field) => ({
    value: `builtin-${field}`,
    target: { kind: "builtin" as const, field },
  })),
];

function targetValue(target: ColumnTarget): string {
  switch (target.kind) {
    case "skip":
      return "skip";
    case "builtin":
      return `builtin-${target.field}`;
    case "contact":
      return `contact-${target.index}-${target.field}`;
    case "custom":
      return "custom";
  }
}

function ImportPage() {
  const { t } = useTranslation();
  const selected = useSelectedTeam();
  const canImport = useHasPermission("members.import");

  if (!selected) {
    return (
      <Alert>
        <AlertDescription>{t("members.noTeam")}</AlertDescription>
      </Alert>
    );
  }
  if (!canImport) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("import.forbidden")}</AlertDescription>
      </Alert>
    );
  }

  return <ImportWizard teamId={selected.team.id} teamName={selected.team.name} />;
}

function ImportWizard({
  teamId,
  teamName,
}: {
  teamId: string;
  teamName: string;
}) {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [plans, setPlans] = useState<ColumnPlan[]>([]);
  const [excludedGroups, setExcludedGroups] = useState<string[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const preview = usePreviewMemberImport(teamId);
  const commit = useCommitMemberImport(teamId);

  /** Distinct `Gruppkoppling` values, so a coach can leave staff rows out. */
  const groupValues = useMemo(() => {
    if (!sheet) return [];
    const column = plans.find(
      (plan) => plan.target.kind === "builtin" && plan.target.field === "group"
    );
    if (!column) return [];
    const values = new Set<string>();
    for (const row of sheet.rows) {
      const value = row[column.index];
      if (typeof value === "string" && value.trim() !== "") {
        values.add(value.trim());
      }
    }
    return [...values].sort();
  }, [sheet, plans]);

  const rows = useMemo(() => {
    if (!sheet) return [];
    return toImportRows(sheet, plans).filter(
      (row) => !row.groups.some((group) => excludedGroups.includes(group))
    );
  }, [sheet, plans, excludedGroups]);

  async function onFile(file: File): Promise<void> {
    setReadError(null);
    preview.reset();
    try {
      const parsed = parseSheet(await readSheet(file));
      setSheet(parsed);
      setPlans(parsed.plans);
      setExcludedGroups([]);
      commit.reset();
    } catch {
      // Almost always a legacy .xls, which this reader cannot open.
      setReadError(t("import.readError"));
      setSheet(null);
    }
  }

  function setPlan(index: number, update: Partial<ColumnPlan>): void {
    setPlans((current) =>
      current.map((plan) =>
        plan.index === index ? { ...plan, ...update } : plan
      )
    );
    preview.reset();
    commit.reset();
  }

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link to="/members">← {t("members.backToList")}</Link>
      </Button>

      <div>
        <h1 className="font-display text-4xl">{t("import.title")}</h1>
        <p className="text-muted-foreground">
          {t("import.intro", { team: teamName })}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="font-display text-xl">{t("import.step1")}</h2>
          <Input
            type="file"
            accept=".xlsx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
          <p className="text-xs text-muted-foreground">{t("import.fileHint")}</p>
          {readError && (
            <Alert variant="destructive">
              <AlertDescription>{readError}</AlertDescription>
            </Alert>
          )}
          {sheet && sheet.teamNames.length > 1 && (
            <Alert>
              <AlertDescription>
                {t("import.manyTeams", {
                  names: sheet.teamNames.join(", "),
                  team: teamName,
                })}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {sheet && (
        <MappingStep
          plans={plans}
          groupValues={groupValues}
          excludedGroups={excludedGroups}
          onToggleGroup={(value) => {
            setExcludedGroups((current) =>
              current.includes(value)
                ? current.filter((item) => item !== value)
                : [...current, value]
            );
            preview.reset();
            commit.reset();
          }}
          onChange={setPlan}
        />
      )}

      {sheet && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl">{t("import.step3")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("import.rowCount", { count: rows.length })}
              </p>
            </div>
            <Button
              disabled={rows.length === 0 || preview.isPending}
              onClick={() => preview.mutate(rows)}
            >
              {preview.isPending ? t("common.loading") : t("import.runPreview")}
            </Button>
          </CardContent>
        </Card>
      )}

      {preview.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t("import.previewError")}</AlertDescription>
        </Alert>
      )}

      {preview.data && !commit.data && (
        <>
          <PreviewResult data={preview.data} dryRun />
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl">{t("import.step4")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("import.commitHint", {
                    created: preview.data.summary.created,
                    updated: preview.data.summary.updated,
                  })}
                  {preview.data.summary.errors > 0 &&
                    ` ${t("import.commitSkipped", {
                      count: preview.data.summary.errors,
                    })}`}
                </p>
              </div>
              <Button
                disabled={
                  commit.isPending ||
                  preview.data.summary.created + preview.data.summary.updated === 0
                }
                onClick={() => commit.mutate(rows)}
              >
                {commit.isPending ? t("common.loading") : t("import.runCommit")}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {commit.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t("import.commitError")}</AlertDescription>
        </Alert>
      )}

      {commit.data && (
        <>
          <Alert>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{t("import.done")}</span>
              <Button size="sm" variant="outline" asChild>
                <Link to="/members">{t("import.toRoster")}</Link>
              </Button>
            </AlertDescription>
          </Alert>
          <PreviewResult data={commit.data} dryRun={false} />
        </>
      )}
    </div>
  );
}

function MappingStep({
  plans,
  groupValues,
  excludedGroups,
  onToggleGroup,
  onChange,
}: {
  plans: ColumnPlan[];
  groupValues: string[];
  excludedGroups: string[];
  onToggleGroup: (value: string) => void;
  onChange: (index: number, update: Partial<ColumnPlan>) => void;
}) {
  const { t } = useTranslation();
  const visible = plans.filter((plan) => !plan.empty);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-xl">{t("import.step2")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("import.mappingHint")}
          </p>
        </div>

        {groupValues.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {t("import.whichRoles")}
            </p>
            <div className="flex flex-wrap gap-4">
              {groupValues.map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={!excludedGroups.includes(value)}
                    onCheckedChange={() => onToggleGroup(value)}
                  />
                  {value}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("import.column")}</TableHead>
                <TableHead>{t("import.targetLabel")}</TableHead>
                <TableHead className="w-24">{t("import.include")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((plan) => (
                <TableRow key={plan.index}>
                  <TableCell>
                    <span>{plan.header}</span>
                    {plan.sensitive && (
                      <Badge variant="secondary" className="ml-2">
                        {t("import.sensitive")}
                      </Badge>
                    )}
                    {plan.sensitive && plan.enabled && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        {t("import.sensitiveWarning")}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {plan.target.kind === "contact" ? (
                      <span className="text-muted-foreground">
                        {t("import.guardianColumn", {
                          index: plan.target.index,
                          field: t(`import.contactField.${plan.target.field}`),
                        })}
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={targetValue(plan.target)}
                          onValueChange={(value) => {
                            const option = TARGET_OPTIONS.find(
                              (item) => item.value === value
                            );
                            onChange(plan.index, {
                              target: option
                                ? option.target
                                : { kind: "custom", name: plan.header },
                            });
                          }}
                        >
                          <SelectTrigger className="w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TARGET_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {t(`import.target.${option.value}`)}
                              </SelectItem>
                            ))}
                            <SelectItem value="custom">
                              {t("import.target.custom")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {plan.target.kind === "custom" && (
                          <Input
                            className="w-48"
                            value={plan.target.name}
                            onChange={(event) =>
                              onChange(plan.index, {
                                target: {
                                  kind: "custom",
                                  name: event.target.value,
                                },
                              })
                            }
                          />
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={plan.enabled}
                      disabled={plan.target.kind === "skip"}
                      onCheckedChange={(enabled) =>
                        onChange(plan.index, { enabled })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

const OUTCOME_VARIANT: Record<
  ImportRowResult["outcome"],
  "default" | "secondary" | "destructive"
> = {
  new: "default",
  update: "default",
  unchanged: "secondary",
  error: "destructive",
};

function PreviewResult({
  data,
  dryRun,
}: {
  dryRun: boolean;
  data: {
    rows: ImportRowResult[];
    summary: {
      created: number;
      updated: number;
      unchanged: number;
      errors: number;
    };
    newGroups: string[];
    newCustomFields: string[];
  };
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap gap-6">
          <Count label={t("import.created")} value={data.summary.created} />
          <Count label={t("import.updated")} value={data.summary.updated} />
          <Count label={t("import.unchanged")} value={data.summary.unchanged} />
          <Count label={t("import.errors")} value={data.summary.errors} />
        </CardContent>
      </Card>

      {(data.newGroups.length > 0 || data.newCustomFields.length > 0) && (
        <Alert>
          <AlertDescription className="flex flex-col gap-1">
            {data.newGroups.length > 0 && (
              <span>
                {t(dryRun ? "import.willCreateGroups" : "import.createdGroups", {
                  names: data.newGroups.join(", "),
                })}
              </span>
            )}
            {data.newCustomFields.length > 0 && (
              <span>
                {t(dryRun ? "import.willCreateFields" : "import.createdFields", {
                  names: data.newCustomFields.join(", "),
                })}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {dryRun && (
        <Alert>
          <AlertDescription>{t("import.dryRun")}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{t("import.row")}</TableHead>
              <TableHead>{t("members.name")}</TableHead>
              <TableHead>{t("import.outcome")}</TableHead>
              <TableHead>{t("import.details")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => (
              <TableRow key={row.rowNumber}>
                <TableCell className="text-muted-foreground">
                  {row.rowNumber}
                </TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>
                  <Badge variant={OUTCOME_VARIANT[row.outcome]}>
                    {t(`import.outcomes.${row.outcome}`)}
                  </Badge>
                  {row.matchedBy && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(`import.matchedBy.${row.matchedBy}`)}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {row.errors.map((error, position) => (
                    <p key={position} className="text-destructive">
                      {t(`import.rowErrors.${error.code}`, {
                        row: error.detail ?? "",
                      })}
                    </p>
                  ))}
                  {/* A warned row still imports; an errored one does not. */}
                  {row.warnings.map((warning, position) => (
                    <p
                      key={position}
                      className="text-amber-600 dark:text-amber-400"
                    >
                      {t(`import.rowErrors.${warning.code}`, {
                        row: warning.detail ?? "",
                      })}
                    </p>
                  ))}
                  {row.changes.map((change, position) => (
                    <p key={position}>
                      <span className="text-muted-foreground">
                        {t(`import.fields.${change.field}`, {
                          defaultValue: change.field,
                        })}
                        :{" "}
                      </span>
                      {change.redacted
                        ? t("import.changedNotShown")
                        : `${change.from ?? "—"} → ${change.to ?? "—"}`}
                    </p>
                  ))}
                  {row.newContacts.length > 0 && (
                    <p className="text-muted-foreground">
                      {t("import.addsGuardians", {
                        names: row.newContacts.join(", "),
                      })}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-3xl">{value}</p>
    </div>
  );
}
