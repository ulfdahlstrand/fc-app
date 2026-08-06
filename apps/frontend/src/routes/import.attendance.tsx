/**
 * Importing a season of attendance (#84, #85, #86).
 *
 * Two sources, one pipeline. SportAdmin's own page is exact but only helps
 * teams coming from SportAdmin; a hand-filled matrix serves everyone else.
 * Both normalise to the same wire rows here, so the planner, the preview and
 * the commit never learn that a second format exists.
 *
 * Its own route beside the roster import, for the same reasons: the wizard
 * owns the screen for several steps, and backfilling half a season is
 * something you go somewhere on purpose to do. Requires `attendance.import`,
 * which only Admin holds by default.
 *
 * Step three is a dry run and writes nothing; step four commits (#85).
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ImportActivity, ImportAttendanceRow } from "@fc-app/contracts";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { readSheet } from "read-excel-file/browser";
import { useActivityTypes } from "../lib/activity-types";
import {
  useCommitAttendanceImport,
  usePreviewAttendanceImport,
} from "../lib/attendance-import";
import {
  attendanceTemplate,
  parseAttendanceSheet,
  parseCsv,
  toImportInput as sheetToImportInput,
  type SheetCell,
} from "../lib/attendance-sheet";
import { useAttendanceStatuses } from "../lib/attendance-statuses";
import { ensureMe } from "../lib/auth";
import { useIsPhone } from "../lib/breakpoint";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import { useMembers } from "../lib/members";
import {
  decodeSportAdminPage,
  mergePages,
  parseAttendancePage,
  toImportInput as pageToImportInput,
  yearFromGroupName,
  type ParsedPage,
} from "../lib/sportadmin-attendance";

export const Route = createFileRoute("/import/attendance")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: AttendanceImportPage,
});

/** Where a Swedish club's wall clock lives; changeable, rarely changed. */
const DEFAULT_TIME_ZONE = "Europe/Stockholm";

/** SportAdmin's own page, or a file somebody filled in. */
type Source = "sportadmin" | "sheet";

function AttendanceImportPage() {
  const { t } = useTranslation();
  const selected = useSelectedTeam();
  const canImport = useHasPermission("attendance.import");
  const isPhone = useIsPhone();

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
        <AlertDescription>{t("attendanceImport.forbidden")}</AlertDescription>
      </Alert>
    );
  }
  // Desktop-only, like the roster import: a season-wide diff is careful,
  // wide-screen work, and getting it wrong writes a term of bad statistics.
  if (isPhone) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-4xl">{t("attendanceImport.title")}</h1>
        <div className="bg-card flex flex-col items-start gap-3 rounded-xl px-5 py-[18px]">
          <p className="font-display text-2xl">{t("import.desktopOnly")}</p>
          <p className="text-muted-foreground">{t("import.desktopOnlyHint")}</p>
          <Button variant="outline" asChild>
            <Link to="/statistics">{t("attendanceImport.backToStats")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AttendanceImportWizard
      teamId={selected.team.id}
      teamName={selected.team.name}
    />
  );
}

function AttendanceImportWizard({
  teamId,
  teamName,
}: {
  teamId: string;
  teamName: string;
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState<Source>("sportadmin");
  const [page, setPage] = useState<ParsedPage | null>(null);
  /** The sheet as read, kept raw so changing a default re-parses it. */
  const [grid, setGrid] = useState<SheetCell[][] | null>(null);
  const [defaultTime, setDefaultTime] = useState("18:00");
  const [defaultType, setDefaultType] = useState("Träning");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [readError, setReadError] = useState<string | null>(null);
  const [statusFor, setStatusFor] = useState<Record<string, string>>({});
  const [typeFor, setTypeFor] = useState<Record<string, string>>({});
  const [skipFormer, setSkipFormer] = useState(true);

  const statuses = useAttendanceStatuses(teamId);
  const types = useActivityTypes(teamId);
  const members = useMembers(teamId, {});
  const preview = usePreviewAttendanceImport(teamId);
  const commit = useCommitAttendanceImport(teamId);

  const parsedSheet = useMemo(
    () =>
      grid
        ? parseAttendanceSheet(grid, {
            time: defaultTime,
            typeName: defaultType,
          })
        : null,
    [grid, defaultTime, defaultType],
  );

  const wire = useMemo(() => {
    if (parsedSheet) return sheetToImportInput(parsedSheet);
    if (!page) return null;
    const { activities, rows } = pageToImportInput(page, year);
    const former = new Set(
      page.members.filter((m) => m.former).map((m) => m.externalRef),
    );
    return {
      activities,
      rows: skipFormer
        ? rows.filter((row) => !former.has(row.externalRef ?? ""))
        : rows,
    } satisfies { activities: ImportActivity[]; rows: ImportAttendanceRow[] };
  }, [parsedSheet, page, year, skipFormer]);

  /** The types the file names, in the order the season met them. */
  const sourceTypes = useMemo(() => {
    if (!wire) return [];
    return [...new Set(wire.activities.map((a) => a.typeName))];
  }, [wire]);

  /** The values the grid actually used — "present", and "absent" if any. */
  const sourceValues = useMemo(() => {
    if (!wire) return [];
    const seen = new Set<string>();
    for (const row of wire.rows) {
      for (const value of Object.values(row.marks)) seen.add(value);
    }
    return [...seen].sort();
  }, [wire]);

  const formerCount = page?.members.filter((m) => m.former).length ?? 0;
  const ready =
    wire !== null &&
    sourceTypes.every((name) => typeFor[name] !== undefined) &&
    sourceValues.every((value) => statusFor[value] !== undefined);

  async function onFiles(files: FileList): Promise<void> {
    setReadError(null);
    preview.reset();
    commit.reset();
    try {
      const parsed: ParsedPage[] = [];
      for (const file of [...files]) {
        parsed.push(
          parseAttendancePage(decodeSportAdminPage(await file.arrayBuffer())),
        );
      }
      const merged = mergePages(parsed);
      setGrid(null);
      setPage(merged);
      setYear(yearFromGroupName(merged.groupName) ?? new Date().getFullYear());
      suggestMappings(
        [...new Set(merged.activities.map((a) => a.typeName))],
        ["present", "absent"],
      );
    } catch (error) {
      setReadError(
        error instanceof Error
          ? error.message
          : t("attendanceImport.readError"),
      );
      setPage(null);
    }
  }

  /**
   * Starting points, all overridable: a status that counts as present for a
   * value that reads like presence, one that does not for the rest, and a
   * type of the same name where the team already has one.
   */
  function suggestMappings(typeNames: string[], values: string[]): void {
    const present = statuses.data?.attendanceStatuses.find(
      (s) => s.countsAsPresent,
    );
    const away = statuses.data?.attendanceStatuses.find(
      (s) => !s.countsAsPresent,
    );
    const PRESENT_LIKE = new Set(["present", "n", "x", "1", "j", "ja"]);
    setStatusFor(
      Object.fromEntries(
        values.flatMap((value) => {
          const guess = PRESENT_LIKE.has(value.toLowerCase()) ? present : away;
          return guess ? [[value, guess.id] as const] : [];
        }),
      ),
    );
    setTypeFor(
      Object.fromEntries(
        typeNames.flatMap((name) => {
          const match = types.data?.activityTypes.find(
            (type) => type.name.toLowerCase() === name.toLowerCase(),
          );
          return match ? [[name, match.id] as const] : [];
        }),
      ),
    );
  }

  /** A `.csv` or `.xlsx` matrix. */
  async function onSheet(file: File): Promise<void> {
    setReadError(null);
    preview.reset();
    commit.reset();
    try {
      const cells: SheetCell[][] = file.name.toLowerCase().endsWith(".csv")
        ? parseCsv(await file.text())
        : ((await readSheet(file)) as SheetCell[][]);
      const parsed = parseAttendanceSheet(cells, {
        time: defaultTime,
        typeName: defaultType,
      });
      setPage(null);
      setGrid(cells);
      suggestMappings(
        [...new Set(parsed.columns.map((c) => c.typeName))],
        parsed.values,
      );
    } catch {
      setReadError(t("attendanceImport.sheetReadError"));
      setGrid(null);
    }
  }

  function downloadTemplate(): void {
    const csv = attendanceTemplate(
      members.data?.members ?? [],
      statuses.data?.attendanceStatuses ?? [],
    );
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `narvaro-${teamName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function payload() {
    if (!wire) return null;
    return {
      timeZone: DEFAULT_TIME_ZONE,
      activities: wire.activities,
      rows: wire.rows,
      statusMapping: sourceValues.map((value) => ({
        value,
        statusId:
          statusFor[value] === "ignore" ? null : (statusFor[value] ?? null),
      })),
      typeMapping: sourceTypes.map((sourceName) => ({
        sourceName,
        activityTypeId:
          typeFor[sourceName] === "create"
            ? null
            : (typeFor[sourceName] ?? null),
        colour: "neutral" as const,
      })),
    };
  }

  function run(): void {
    const input = payload();
    if (input) preview.mutate(input);
  }

  function runCommit(): void {
    const input = payload();
    if (input) commit.mutate(input);
  }

  const done = commit.data;
  const result = done ?? preview.data;

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link to="/statistics">← {t("attendanceImport.backToStats")}</Link>
      </Button>

      <div>
        <h1 className="font-display text-4xl">{t("attendanceImport.title")}</h1>
        <p className="text-muted-foreground">
          {t("attendanceImport.intro", { team: teamName })}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="font-display text-xl">
            {t("attendanceImport.step1")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {(["sportadmin", "sheet"] as const).map((option) => (
              <Button
                key={option}
                size="sm"
                variant={source === option ? "default" : "outline"}
                onClick={() => {
                  setSource(option);
                  setPage(null);
                  setGrid(null);
                  setReadError(null);
                  preview.reset();
                  commit.reset();
                }}
              >
                {t(`attendanceImport.source.${option}`)}
              </Button>
            ))}
          </div>

          {source === "sportadmin" ? (
            <>
              <Input
                type="file"
                accept=".html,.htm"
                multiple
                onChange={(event) => {
                  const files = event.target.files;
                  if (files && files.length > 0) void onFiles(files);
                }}
              />
              <p className="text-xs whitespace-pre-line text-muted-foreground">
                {t("attendanceImport.fileHint")}
              </p>
            </>
          ) : (
            <>
              <Input
                type="file"
                accept=".csv,.xlsx"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onSheet(file);
                }}
              />
              <p className="text-xs whitespace-pre-line text-muted-foreground">
                {t("attendanceImport.sheetHint")}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                disabled={!members.data}
                onClick={downloadTemplate}
              >
                {t("attendanceImport.downloadTemplate")}
              </Button>
            </>
          )}

          {readError && (
            <Alert variant="destructive">
              <AlertDescription>{readError}</AlertDescription>
            </Alert>
          )}
          {page && (
            <p className="text-sm">
              {t("attendanceImport.read", {
                activities: page.activities.length,
                members: page.members.length,
                group: page.groupName ?? "—",
              })}
            </p>
          )}
          {parsedSheet && (
            <p className="text-sm">
              {t("attendanceImport.readSheet", {
                activities: parsedSheet.columns.length,
                members: parsedSheet.rows.length,
              })}
            </p>
          )}
          {parsedSheet && parsedSheet.problems.length > 0 && (
            <Alert>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {parsedSheet.problems.map((problem) => (
                    <li key={`${problem.kind}-${problem.at}`}>
                      {t(`attendanceImport.problem.${problem.kind}`, {
                        at: problem.at,
                        detail: problem.detail,
                      })}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {wire && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <h2 className="font-display text-xl">
              {t("attendanceImport.step2")}
            </h2>

            {page && (
              <label className="flex flex-col gap-1">
                <span className="text-sm">{t("attendanceImport.year")}</span>
                <Input
                  type="number"
                  className="w-32"
                  value={year}
                  onChange={(event) => {
                    setYear(Number(event.target.value));
                    preview.reset();
                    commit.reset();
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  {t("attendanceImport.yearHint")}
                </span>
              </label>
            )}

            {/* A sheet dates every column, but names the time and the type
                only where they differ — so the common case is set once. */}
            {parsedSheet && (
              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-sm">
                    {t("attendanceImport.defaultTime")}
                  </span>
                  <Input
                    className="w-32"
                    value={defaultTime}
                    onChange={(event) => {
                      setDefaultTime(event.target.value);
                      preview.reset();
                      commit.reset();
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm">
                    {t("attendanceImport.defaultType")}
                  </span>
                  <Input
                    className="w-48"
                    value={defaultType}
                    onChange={(event) => {
                      setDefaultType(event.target.value);
                      preview.reset();
                      commit.reset();
                    }}
                  />
                </label>
              </div>
            )}

            {formerCount > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={skipFormer}
                  onChange={(event) => {
                    setSkipFormer(event.target.checked);
                    preview.reset();
                    commit.reset();
                  }}
                />
                {t("attendanceImport.skipFormer", { count: formerCount })}
              </label>
            )}

            <div className="flex flex-col gap-2">
              <span className="text-sm">
                {t("attendanceImport.typeMapping")}
              </span>
              {sourceTypes.map((name) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-40 text-sm">{name}</span>
                  <Select
                    value={typeFor[name] ?? ""}
                    onValueChange={(value) => {
                      setTypeFor((current) => ({ ...current, [name]: value }));
                      preview.reset();
                      commit.reset();
                    }}
                  >
                    <SelectTrigger className="w-72">
                      <SelectValue placeholder={t("attendanceImport.choose")} />
                    </SelectTrigger>
                    <SelectContent>
                      {types.data?.activityTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="create">
                        {t("attendanceImport.createType", { name })}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm">
                {t("attendanceImport.statusMapping")}
              </span>
              {sourceValues.map((value) => (
                <div key={value} className="flex items-center gap-3">
                  <span className="w-40 text-sm">
                    {t(`attendanceImport.value.${value}`, value)}
                  </span>
                  <Select
                    value={statusFor[value] ?? ""}
                    onValueChange={(next) => {
                      setStatusFor((current) => ({
                        ...current,
                        [value]: next,
                      }));
                      preview.reset();
                      commit.reset();
                    }}
                  >
                    <SelectTrigger className="w-72">
                      <SelectValue placeholder={t("attendanceImport.choose")} />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.data?.attendanceStatuses.map((status) => (
                        <SelectItem key={status.id} value={status.id}>
                          {status.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="ignore">
                        {t("attendanceImport.ignoreValue")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                {t("attendanceImport.unmarkedHint")}
              </p>
            </div>

            <Button
              className="self-start"
              disabled={!ready || preview.isPending}
              onClick={run}
            >
              {t("attendanceImport.runPreview")}
            </Button>
          </CardContent>
        </Card>
      )}

      {preview.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {t("attendanceImport.previewError")}
          </AlertDescription>
        </Alert>
      )}

      {result && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <h2 className="font-display text-xl">
              {t("attendanceImport.step3")}
            </h2>
            <Alert variant={done ? "default" : undefined}>
              <AlertDescription>
                {done ? t("attendanceImport.done") : t("import.dryRun")}
              </AlertDescription>
            </Alert>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {t("attendanceImport.activitiesCreated", {
                  count: result.summary.activitiesCreated,
                })}
              </Badge>
              <Badge variant="outline">
                {t("attendanceImport.activitiesReused", {
                  count: result.summary.activitiesReused,
                })}
              </Badge>
              <Badge variant="outline">
                {t("attendanceImport.activitiesSkipped", {
                  count: result.summary.activitiesSkipped,
                })}
              </Badge>
              <Badge variant="outline">
                {t("attendanceImport.marksAdded", {
                  count: result.summary.marksAdded,
                })}
              </Badge>
              <Badge variant="outline">
                {t("attendanceImport.marksChanged", {
                  count: result.summary.marksChanged,
                })}
              </Badge>
              <Badge variant="outline">
                {t("attendanceImport.marksUnchanged", {
                  count: result.summary.marksUnchanged,
                })}
              </Badge>
              {result.summary.errors > 0 && (
                <Badge variant="destructive">
                  {t("import.errors")}: {result.summary.errors}
                </Badge>
              )}
            </div>

            {result.newActivityTypes.length > 0 && (
              <Alert>
                <AlertDescription>
                  {t("attendanceImport.willCreateTypes", {
                    names: result.newActivityTypes.join(", "),
                  })}
                </AlertDescription>
              </Alert>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("attendanceImport.member")}</TableHead>
                  <TableHead>{t("attendanceImport.added")}</TableHead>
                  <TableHead>{t("attendanceImport.changed")}</TableHead>
                  <TableHead>{t("import.unchanged")}</TableHead>
                  <TableHead>{t("attendanceImport.beforeJoining")}</TableHead>
                  <TableHead>{t("import.details")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.added}</TableCell>
                    <TableCell>{row.changed}</TableCell>
                    <TableCell>{row.unchanged}</TableCell>
                    <TableCell>
                      {row.beforeJoining > 0 ? row.beforeJoining : "—"}
                    </TableCell>
                    <TableCell className="text-destructive text-sm">
                      {row.errors
                        .map((error) =>
                          t(`attendanceImport.error.${error.code}`, {
                            detail: error.detail ?? "",
                          }),
                        )
                        .join(" · ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {commit.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {t("attendanceImport.commitError")}
                </AlertDescription>
              </Alert>
            )}

            {done ? (
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" asChild>
                  <Link to="/activities">
                    {t("attendanceImport.toCalendar")}
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/statistics">
                    {t("attendanceImport.backToStats")}
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <Button
                  disabled={commit.isPending || result.summary.errors > 0}
                  onClick={runCommit}
                >
                  {t("attendanceImport.commit")}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {result.summary.errors > 0
                    ? t("attendanceImport.fixErrorsFirst")
                    : t("attendanceImport.commitHint")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
