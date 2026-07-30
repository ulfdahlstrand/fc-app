/** A member's tracking status (issue #19) on the member detail page. */
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateLong, SEPARATOR, useDateLocale } from "@/lib/dates";
import {
  cellKey,
  entriesByCell,
  isTrackingComplete,
  useMemberTracking,
} from "@/lib/tracking";

export function MemberTrackingSection({
  teamId,
  memberId,
}: {
  teamId: string;
  memberId: string;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const tracking = useMemberTracking(teamId, memberId);

  const byCell = entriesByCell(tracking.data?.entries ?? []);

  // A retired list is only worth a row if this member actually has something
  // recorded against it; otherwise it is just noise on their page.
  const definitions = (tracking.data?.definitions ?? []).filter(
    (definition) =>
      !definition.archived || byCell.has(cellKey(definition.id, memberId)),
  );

  if (tracking.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("tracking.loadError")}</AlertDescription>
      </Alert>
    );
  }
  if (tracking.isPending || definitions.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-xl">{t("tracking.heading")}</h2>
      <div className="flex flex-col gap-[11px]">
        {definitions.map((definition) => {
          const entry = byCell.get(cellKey(definition.id, memberId));
          const done = isTrackingComplete(definition, entry);
          const isTick = definition.valueType === "done";

          return (
            <div
              key={definition.id}
              className="bg-card flex items-center gap-4 rounded-md px-4 py-3"
            >
              {/* Dashed only when there is nothing recorded. A date or a note
                  that has been filled in *has* been decided, so it gets a solid
                  disc — dashed here would say the opposite of the truth. The
                  green tick stays reserved for a box actually ticked. */}
              <span
                aria-hidden
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  entry === undefined
                    ? "border-2 border-dashed border-[var(--border-dashed)] text-[var(--neutral-500)]"
                    : isTick && done
                      ? "bg-brand text-white"
                      : "bg-[var(--neutral-150)] text-[var(--neutral-650)]",
                )}
              >
                {isTick && done ? "✓" : ""}
              </span>

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{definition.name}</span>
                  {definition.archived && (
                    <Badge variant="secondary">
                      {t("settings.team.archived")}
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground text-sm">
                  {entry === undefined
                    ? t("tracking.notYet")
                    : isTick
                      ? t("tracking.done")
                      : definition.valueType === "date"
                        ? formatDateLong(`${entry.value}T00:00:00Z`, locale)
                        : entry.value}
                </span>
              </span>

              {/* Who signed off, and when. A tick nobody can trace is worth
                  less than no tick at all. */}
              {entry !== undefined && (
                <span className="text-muted-foreground shrink-0 text-right text-xs font-semibold">
                  {[
                    entry.updatedByName ?? t("tracking.someone"),
                    formatDateLong(entry.updatedAt, locale),
                  ].join(SEPARATOR)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
