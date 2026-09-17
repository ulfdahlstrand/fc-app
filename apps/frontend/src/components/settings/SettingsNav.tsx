/**
 * The team settings menu — the same ordered list in both shells, drawn the way
 * each shell draws a list.
 *
 * Desktop: a column beside the content. Kit has no dividers, so the rows are
 * separate surfaces; the active one is a solid ink tile, matching the nav pill
 * in the app bar rather than inventing a second "you are here" treatment. It
 * sticks below the app bar so the menu stays reachable while a long section —
 * a season list, a field list — scrolls past it.
 *
 * Phone: the same rows at Kit's 54px list height, full width, as the page
 * itself. That is the `MenuSheet` row, reused: on a phone a menu *is* the
 * screen, and a 220px column beside 170px of content is not a layout.
 */
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TeamSettingsSection } from "@/lib/team-settings";

/** Kit's list row: a white tile, 54px, no divider and no chevron on desktop. */
const rowBase =
  "flex items-center gap-3 rounded-lg text-left text-[15px] font-semibold transition-colors duration-[120ms] ease-standard";

export function SettingsNav({
  sections,
  activeId,
  variant,
}: {
  sections: readonly TeamSettingsSection[];
  /** The section on screen, or null on the phone's menu, where none is. */
  activeId: string | null;
  /** `column` is the desktop's sidebar; `list` is the phone's whole page. */
  variant: "column" | "list";
}) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("settings.team.sectionsLabel")}
      className={cn(
        "flex flex-col gap-2",
        // Sticky needs room to travel, so the caller gives it a grid cell
        // that stretches to the section beside it and this sits inside.
        variant === "column" && "sticky top-6",
      )}
    >
      {sections.map((section) => {
        const active = section.id === activeId;
        return (
          <Link
            key={section.id}
            to="/settings/team"
            search={{ section: section.id }}
            aria-current={active ? "page" : undefined}
            className={cn(
              rowBase,
              variant === "column" ? "min-h-11 px-4 py-2" : "min-h-tap-row px-4",
              active
                ? "bg-ink text-white"
                : "bg-card text-foreground hover:bg-accent",
            )}
          >
            <span className="flex-1">{t(section.labelKey)}</span>
            {/* The phone's row leads somewhere else; the desktop's swaps the
                column beside it, which the ink tile already says. */}
            {variant === "list" && (
              <ChevronRightIcon
                aria-hidden
                className="text-muted-foreground size-4 flex-none"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
