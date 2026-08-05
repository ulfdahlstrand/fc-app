/** Seasons — a named date range; activities join by date, not by key (ADR-008). */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { formatDateRange, useDateLocale } from "@/lib/dates";
import { useZodResolver } from "@/lib/form";
import {
  seasonFormSchema,
  useCreateSeason,
  useDeleteSeason,
  useSeasons,
  useUpdateSeason,
  type SeasonFormValues,
  type SeasonWriteInput,
} from "@/lib/seasons";
import { type Season } from "@fc-app/contracts";

export function Seasons({ teamId }: { teamId: string }) {
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

            <div className="grid gap-4 kit:grid-cols-2">
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

/** Activity types manager (issue #11) — activity types are data, not code. */
