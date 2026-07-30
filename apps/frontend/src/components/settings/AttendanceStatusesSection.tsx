/** Attendance statuses. "Counts as present" is stored, never inferred from the name (ADR-012). */
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
import { Switch } from "@/components/ui/switch";
import { ACTIVITY_COLOURS, ACTIVITY_COLOUR_DOT } from "@/lib/activity-types";
import {
  attendanceStatusFormSchema,
  useArchiveAttendanceStatus,
  useAttendanceStatuses,
  useCreateAttendanceStatus,
  useUpdateAttendanceStatus,
  type AttendanceStatusFormOutput,
  type AttendanceStatusFormValues,
} from "@/lib/attendance-statuses";
import { useZodResolver } from "@/lib/form";
import { cn } from "@/lib/utils";
import { type AttendanceStatus } from "@fc-app/contracts";

export function AttendanceStatuses({ teamId }: { teamId: string }) {
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
