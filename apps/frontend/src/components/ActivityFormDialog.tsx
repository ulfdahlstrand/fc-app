/**
 * Create/edit dialog for an activity (issue #12).
 *
 * Follows the form pattern from ADR-007 (see `MemberFormDialog`): react-hook-form
 * with a Zod schema derived from the contract, and translated messages.
 *
 * The type select offers active types only — a retired type keeps rendering on
 * the activities that already use it, but nothing new may be filed under it.
 */
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
import { Textarea } from "@/components/ui/textarea";
import {
  activityFormSchema,
  type ActivityFormValues,
  type ActivityWriteInput,
} from "@/lib/activities";
import { defaultActivitySlot, toDateTimeInput } from "@/lib/dates";
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
  onSave: (input: ActivityWriteInput) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const form = useForm<ActivityFormValues, unknown, ActivityWriteInput>({
    resolver: useZodResolver(activityFormSchema, "activities.validation"),
    defaultValues: defaultValues(activityTypes, activity, day),
  });

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
