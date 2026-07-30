/** Create/edit dialog for an activity (issue #12). */
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { Activity, ActivityType } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  activityFormSchema,
  type ActivityFormOutput,
  type ActivityFormValues,
} from "@/lib/activities";
import {
  defaultActivitySlot,
  isoWeekdayLabels,
  isoWeekdayOf,
  ISO_WEEKDAYS,
  toDateTimeInput,
  useDateLocale,
} from "@/lib/dates";
import { useZodResolver } from "@/lib/form";

function defaultValues(
  activityTypes: ActivityType[],
  activity?: Activity,
  day?: Date,
): ActivityFormValues {
  if (activity) {
    return {
      activityTypeId: activity.activityTypeId,
      title: activity.title ?? "",
      startsAt: toDateTimeInput(activity.startsAt),
      endsAt: activity.endsAt === null ? "" : toDateTimeInput(activity.endsAt),
      location: activity.location ?? "",
      notes: activity.notes ?? "",
      // Editing never changes a recurrence rule (ADR-008) — the scope choice
      // covers what a coach actually needs.
      repeats: false,
      weekdays: [],
      until: "",
    };
  }

  // A new activity opens on the clicked day (or today) at the usual 17:30
  // training slot — the common case takes no typing.
  const slot = defaultActivitySlot(day);
  return {
    activityTypeId: activityTypes[0]?.id ?? "",
    title: "",
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    location: "",
    notes: "",
    repeats: false,
    // Pre-ticked to the day the activity starts on: "repeats weekly" almost
    // always means "this weekday, every week".
    weekdays: [isoWeekdayOf(slot.startsAt.slice(0, 10))],
    until: "",
  };
}

export function ActivityFormDialog({
  activity,
  activityTypes,
  day,
  saving,
  errorMessage,
  onSave,
  onClose,
}: {
  activity?: Activity;
  /** Selectable types — active ones only. */
  activityTypes: ActivityType[];
  /** The day a "+" was clicked on, used as the default date for a new activity. */
  day?: Date;
  saving: boolean;
  errorMessage: string | null;
  onSave: (form: ActivityFormOutput) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const form = useForm<ActivityFormValues, unknown, ActivityFormOutput>({
    resolver: useZodResolver(activityFormSchema, "activities.validation"),
    defaultValues: defaultValues(activityTypes, activity, day),
  });

  // Recurrence is a create-time choice; an existing activity is edited through
  // the scope question on the detail page instead.
  const isEdit = activity !== undefined;
  const repeats = form.watch("repeats");
  const weekdayLabels = isoWeekdayLabels(locale);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {activity ? t("activities.editTitle") : t("activities.newTitle")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            id="activity-form"
            className="grid gap-4"
            onSubmit={form.handleSubmit(onSave)}
            noValidate
          >
            {errorMessage !== null && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="activityTypeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activities.type")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activityTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activities.titleField")}</FormLabel>
                  <FormControl>
                    <Input maxLength={100} {...field} />
                  </FormControl>
                  <FormDescription>
                    {t("activities.titleHelp")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("activities.starts")}</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("activities.ends")}</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activities.location")}</FormLabel>
                  <FormControl>
                    <Input maxLength={200} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activities.notes")}</FormLabel>
                  <FormControl>
                    <Textarea maxLength={2000} rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isEdit && (
              <div className="flex flex-col gap-4 rounded-md bg-secondary p-4">
                <FormField
                  control={form.control}
                  name="repeats"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">
                        {t("activities.repeatsWeekly")}
                      </FormLabel>
                    </FormItem>
                  )}
                />

                {repeats && (
                  <>
                    <FormField
                      control={form.control}
                      name="weekdays"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("activities.onDays")}</FormLabel>
                          <FormControl>
                            <div className="flex flex-wrap gap-1.5">
                              {ISO_WEEKDAYS.map((weekday) => {
                                const picked = field.value.includes(weekday);
                                return (
                                  <button
                                    key={weekday}
                                    type="button"
                                    aria-pressed={picked}
                                    onClick={() =>
                                      field.onChange(
                                        picked
                                          ? field.value.filter(
                                              (day) => day !== weekday,
                                            )
                                          : [...field.value, weekday].sort(),
                                      )
                                    }
                                    className={cn(
                                      "size-10 rounded-full text-sm font-bold uppercase transition-colors duration-[120ms] ease-standard",
                                      picked
                                        ? "bg-ink text-white"
                                        : "bg-card text-muted-foreground hover:bg-[var(--neutral-250)]",
                                    )}
                                  >
                                    {weekdayLabels[weekday]}
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
                      name="until"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("activities.until")}</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormDescription>
                            {t("activities.untilHelp")}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </div>
            )}
          </form>
        </Form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button type="submit" form="activity-form" disabled={saving}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
