/**
 * Team settings — every piece of per-team configuration (ADR-005).
 *
 * Requires settings.team in the selected team. Activity types (#11), attendance
 * statuses (#14), seasons (#13), custom member fields (#8) and tracking lists
 * (#19) all follow the same shape: define, rename, and archive rather than
 * delete, so the records made under a retired definition survive it.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  memberFieldTypeSchema,
  type ActivityType,
  type AttendanceStatus,
  type MemberFieldDefinition,
  type Season,
  type TrackingDefinition,
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
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
} from "../lib/activity-types";
import {
  attendanceStatusFormSchema,
  useArchiveAttendanceStatus,
  useAttendanceStatuses,
  useCreateAttendanceStatus,
  useUpdateAttendanceStatus,
  type AttendanceStatusFormOutput,
  type AttendanceStatusFormValues,
} from "../lib/attendance-statuses";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import { formatDateRange, useDateLocale } from "../lib/dates";
import { useZodResolver } from "../lib/form";
import {
  seasonFormSchema,
  useCreateSeason,
  useDeleteSeason,
  useSeasons,
  useUpdateSeason,
  type SeasonFormValues,
  type SeasonWriteInput,
} from "../lib/seasons";
import {
  memberFieldFormSchema,
  useArchiveMemberField,
  useCreateMemberField,
  useMemberFields,
  useUpdateMemberField,
  type MemberFieldFormOutput,
  type MemberFieldFormValues,
} from "../lib/member-fields";
import {
  TRACKING_VALUE_TYPES,
  trackingFormSchema,
  useArchiveTrackingDefinition,
  useCreateTrackingDefinition,
  useTrackingDefinitions,
  useUpdateTrackingDefinition,
  type TrackingFormOutput,
  type TrackingFormValues,
} from "../lib/tracking";

export const Route = createFileRoute("/settings/team")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: TeamSettingsPage,
});

function TeamSettingsPage() {
  const { t } = useTranslation();
  const selected = useSelectedTeam();
  const canManage = useHasPermission("settings.team");

  if (!selected) {
    return (
      <Alert>
        <AlertDescription>{t("members.noTeam")}</AlertDescription>
      </Alert>
    );
  }
  if (!canManage) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("settings.team.forbidden")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">{t("settings.team.heading")}</h1>
        <p className="text-muted-foreground">{selected.team.name}</p>
      </div>
      <ActivityTypes teamId={selected.team.id} />
      <AttendanceStatuses teamId={selected.team.id} />
      <Seasons teamId={selected.team.id} />
      <MemberFields teamId={selected.team.id} />
      <TrackingLists teamId={selected.team.id} />
    </div>
  );
}

/**
 * Attendance statuses manager (issue #14) — statuses are data, not code.
 *
 * Shares the activity types' shape: Kit colour token rather than a free
 * colour, archive rather than delete. The one addition is "counts as present",
 * the flag statistics (#15) sums — a team may well decide "Late" counts and
 * "Injured" does not, and neither name says so.
 */
function AttendanceStatuses({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const statuses = useAttendanceStatuses(teamId, true);
  const archiveStatus = useArchiveAttendanceStatus(teamId);
  const [editing, setEditing] = useState<AttendanceStatus | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl">
          {t("attendanceStatuses.heading")}
        </h2>
        <Button onClick={() => setCreating(true)}>
          {t("attendanceStatuses.new")}
        </Button>
      </div>

      {statuses.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : statuses.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {t("attendanceStatuses.loadError")}
          </AlertDescription>
        </Alert>
      ) : statuses.data.attendanceStatuses.length === 0 ? (
        <p className="text-muted-foreground">{t("attendanceStatuses.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {statuses.data.attendanceStatuses.map((status) => (
            <div
              key={status.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card p-3"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0 rounded-full",
                    ACTIVITY_COLOUR_DOT[status.colour],
                  )}
                />
                <p className="font-medium">{status.name}</p>
                {status.countsAsPresent && (
                  <Badge variant="secondary">
                    {t("attendanceStatuses.countsAsPresent")}
                  </Badge>
                )}
                {status.archived && (
                  <Badge variant="secondary">
                    {t("settings.team.archived")}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(status)}
                >
                  {t("common.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={archiveStatus.isPending}
                  onClick={() =>
                    archiveStatus.mutate({
                      attendanceStatusId: status.id,
                      archived: !status.archived,
                    })
                  }
                >
                  {status.archived
                    ? t("settings.team.restore")
                    : t("settings.team.archive")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <AttendanceStatusDialog
          teamId={teamId}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <AttendanceStatusDialog
          teamId={teamId}
          status={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function AttendanceStatusDialog({
  teamId,
  status,
  onClose,
}: {
  teamId: string;
  status?: AttendanceStatus;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createStatus = useCreateAttendanceStatus(teamId);
  const updateStatus = useUpdateAttendanceStatus(teamId);
  const isEdit = status !== undefined;

  const form = useForm<
    AttendanceStatusFormValues,
    unknown,
    AttendanceStatusFormOutput
  >({
    resolver: useZodResolver(
      attendanceStatusFormSchema,
      "attendanceStatuses.validation",
    ),
    defaultValues: {
      name: status?.name ?? "",
      colour: status?.colour ?? "neutral",
      countsAsPresent: status?.countsAsPresent ?? false,
    },
  });

  const pending = createStatus.isPending || updateStatus.isPending;
  const saveError = createStatus.error ?? updateStatus.error;

  const handleSave = form.handleSubmit(async (data) => {
    if (isEdit) {
      await updateStatus.mutateAsync({
        attendanceStatusId: status.id,
        ...data,
      });
    } else {
      await createStatus.mutateAsync(data);
    }
    onClose();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("attendanceStatuses.editTitle")
              : t("attendanceStatuses.newTitle")}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {saveError !== null && (
              <Alert variant="destructive">
                <AlertDescription>
                  {saveError.message ?? t("attendanceStatuses.saveError")}
                </AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.team.name")}</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus maxLength={100} />
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
                              "size-9 rounded-full transition-transform duration-[120ms] ease-standard active:scale-[0.97]",
                              ACTIVITY_COLOUR_DOT[colour],
                              selected &&
                                "ring-2 ring-[var(--ink-800)] ring-offset-2",
                            )}
                          />
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
              name="countsAsPresent"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-3">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">
                      {t("attendanceStatuses.countsAsPresent")}
                    </FormLabel>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {t("attendanceStatuses.countsAsPresentHint")}
                  </p>
                </FormItem>
              )}
            />

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

/**
 * Seasons manager (issue #13) — the named date ranges the team's work is
 * measured in ("Autumn 2026").
 *
 * Nothing points at a season by foreign key: membership is derived from an
 * activity's start date, so deleting one removes a lens, never data. That is
 * why this offers a plain delete where activity types only archive.
 */
function Seasons({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const seasons = useSeasons(teamId);
  const deleteSeason = useDeleteSeason(teamId);
  const [editing, setEditing] = useState<Season | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl">{t("seasons.heading")}</h2>
        <Button onClick={() => setCreating(true)}>{t("seasons.new")}</Button>
      </div>

      {seasons.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : seasons.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("seasons.loadError")}</AlertDescription>
        </Alert>
      ) : seasons.data.seasons.length === 0 ? (
        <p className="text-muted-foreground">{t("seasons.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {seasons.data.seasons.map((season) => (
            <div
              key={season.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card p-3"
            >
              <div className="flex flex-wrap items-baseline gap-3">
                <p className="font-medium">{season.name}</p>
                <p className="text-muted-foreground text-sm">
                  {formatDateRange(season.startsOn, season.endsOn, locale)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(season)}
                >
                  {t("common.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={deleteSeason.isPending}
                  onClick={() => deleteSeason.mutate({ seasonId: season.id })}
                >
                  {t("common.delete")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <SeasonDialog teamId={teamId} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <SeasonDialog
          teamId={teamId}
          season={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SeasonDialog({
  teamId,
  season,
  onClose,
}: {
  teamId: string;
  season?: Season;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createSeason = useCreateSeason(teamId);
  const updateSeason = useUpdateSeason(teamId);
  const isEdit = season !== undefined;

  const form = useForm<SeasonFormValues, unknown, SeasonWriteInput>({
    resolver: useZodResolver(seasonFormSchema, "seasons.validation"),
    defaultValues: {
      name: season?.name ?? "",
      startsOn: season?.startsOn ?? "",
      endsOn: season?.endsOn ?? "",
    },
  });

  const pending = createSeason.isPending || updateSeason.isPending;
  // The backend explains *why* (a clashing name, say) — prefer its reason.
  const saveError = createSeason.error ?? updateSeason.error;

  const handleSave = form.handleSubmit(async (data) => {
    if (isEdit) {
      await updateSeason.mutateAsync({ seasonId: season.id, ...data });
    } else {
      await createSeason.mutateAsync(data);
    }
    onClose();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("seasons.editTitle") : t("seasons.newTitle")}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {saveError !== null && (
              <Alert variant="destructive">
                <AlertDescription>
                  {saveError.message ?? t("seasons.saveError")}
                </AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("seasons.name")}</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus maxLength={100} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startsOn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("seasons.startsOn")}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endsOn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("seasons.endsOn")}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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

/**
 * Activity types manager (issue #11) — activity types are data, not code.
 *
 * The colour is picked from the Kit palette rather than a free colour input:
 * Kit allows three colour families and nothing else.
 */
function ActivityTypes({ teamId }: { teamId: string }) {
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
  // Kit's voice is "reasons, not codes": the backend already explains *why*
  // a save failed (a clashing name, say), so prefer its message over the
  // generic fallback.
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

function MemberFields({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const fields = useMemberFields(teamId, true);
  const archiveField = useArchiveMemberField(teamId);
  const [editing, setEditing] = useState<MemberFieldDefinition | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl">{t("settings.team.fields")}</h2>
          <Button onClick={() => setCreating(true)}>
            {t("settings.team.newField")}
          </Button>
        </div>

        {fields.isPending ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : fields.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{t("settings.team.loadError")}</AlertDescription>
          </Alert>
        ) : fields.data.fields.length === 0 ? (
          <p className="text-muted-foreground">{t("settings.team.empty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {fields.data.fields.map((field) => (
              <div
                key={field.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{field.name}</p>
                    <Badge variant="secondary">
                      {t(`fieldType.${field.fieldType}`)}
                    </Badge>
                    {field.required && (
                      <Badge>{t("settings.team.required")}</Badge>
                    )}
                    {field.archived && (
                      <Badge variant="secondary">
                        {t("settings.team.archived")}
                      </Badge>
                    )}
                  </div>
                  {field.fieldType === "select" && (
                    <p className="text-sm text-muted-foreground">
                      {field.options.join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(field)}
                  >
                    {t("common.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={archiveField.isPending}
                    onClick={() =>
                      archiveField.mutate({
                        fieldId: field.id,
                        archived: !field.archived,
                      })
                    }
                  >
                    {field.archived
                      ? t("settings.team.restore")
                      : t("settings.team.archive")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <FieldDialog teamId={teamId} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <FieldDialog
          teamId={teamId}
          field={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

const FIELD_TYPES = memberFieldTypeSchema.options;

function FieldDialog({
  teamId,
  field,
  onClose,
}: {
  teamId: string;
  field?: MemberFieldDefinition;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createField = useCreateMemberField(teamId);
  const updateField = useUpdateMemberField(teamId);
  const isEdit = field !== undefined;

  const form = useForm<MemberFieldFormValues, unknown, MemberFieldFormOutput>({
    resolver: useZodResolver(memberFieldFormSchema, "settings.team.validation"),
    defaultValues: {
      name: field?.name ?? "",
      fieldType: field?.fieldType ?? "text",
      required: field?.required ?? false,
    },
  });
  const [optionsText, setOptionsText] = useState(
    (field?.options ?? []).join("\n")
  );

  const fieldType = form.watch("fieldType");
  const needsOptions = fieldType === "select";
  const options = optionsText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const canSave = !needsOptions || options.length > 0;

  const pending = createField.isPending || updateField.isPending;
  const error = createField.isError || updateField.isError;

  const handleSave = form.handleSubmit(async (data) => {
    if (isEdit) {
      await updateField.mutateAsync({
        fieldId: field.id,
        name: data.name,
        required: data.required,
        ...(field.fieldType === "select" ? { options } : {}),
      });
    } else {
      await createField.mutateAsync({
        name: data.name,
        fieldType: data.fieldType,
        required: data.required,
        ...(needsOptions ? { options } : {}),
      });
    }
    onClose();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("settings.team.editField") : t("settings.team.newField")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            id="field-form"
            className="grid gap-4"
            onSubmit={handleSave}
            noValidate
          >
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{t("settings.team.saveError")}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field: formField }) => (
                <FormItem>
                  <FormLabel>{t("settings.team.fieldName")}</FormLabel>
                  <FormControl>
                    <Input maxLength={100} {...formField} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fieldType"
              render={({ field: formField }) => (
                <FormItem>
                  <FormLabel>{t("settings.team.fieldType")}</FormLabel>
                  {/* Type is fixed after creation — changing it would
                      invalidate existing values. */}
                  <Select
                    value={formField.value}
                    onValueChange={formField.onChange}
                    disabled={isEdit}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FIELD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`fieldType.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {needsOptions && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="field-options">{t("settings.team.options")}</Label>
                <textarea
                  id="field-options"
                  rows={3}
                  value={optionsText}
                  onChange={(event) => setOptionsText(event.target.value)}
                  className={cn(
                    "border-input placeholder:text-muted-foreground dark:bg-input/30 flex min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm",
                    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                  )}
                />
                <p className="text-sm text-muted-foreground">
                  {t("settings.team.optionsHelp")}
                </p>
              </div>
            )}

            <FormField
              control={form.control}
              name="required"
              render={({ field: formField }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={formField.value}
                        onCheckedChange={formField.onChange}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">
                      {t("settings.team.requiredLabel")}
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            type="submit"
            form="field-form"
            disabled={!canSave || pending}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tracking lists (#19) — the configurable checklists the matrix at /tracking
 * fills in. Same define/rename/archive shape as every other section here;
 * archiving takes the column off the matrix and keeps the entries.
 */
function TrackingLists({ teamId }: { teamId: string }) {
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
