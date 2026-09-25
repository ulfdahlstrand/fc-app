/**
 * A page's section menu — the same ordered list in both shells, drawn the way
 * each shell draws a list. Team settings and the members page both use it, so
 * a page split into sections works one way across the app.
 *
 * Desktop: a column beside the content. Kit has no dividers, so the rows are
 * separate surfaces; the active one is a solid ink tile, matching the nav pill
 * in the app bar rather than inventing a second "you are here" treatment. It
 * sticks below the app bar so the menu stays reachable while a long section —
 * a season list, a roster — scrolls past it.
 *
 * Phone: the same rows at Kit's 54px list height, full width, as the page
 * itself. That is the `MenuSheet` row, reused: on a phone a menu *is* the
 * screen, and a 220px column beside 170px of content is not a layout. The
 * section opens as the page after it, with `SectionBackLink` as the way back.
 *
 * On the desktop the column can be folded away entirely (`SectionColumns`), so
 * a wide section — a roster with many field columns — gets the whole width.
 */
import { useState, type ReactNode } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Folded or not is a per-browser convenience, and one setting for every page
 * with a section menu — folding it on one page and finding it open on the
 * next would be a menu that forgets.
 */
const HIDDEN_KEY = "fc-app.section-nav-hidden";

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "true";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    localStorage.setItem(HIDDEN_KEY, String(hidden));
  } catch {
    // Still folds; it just opens again on the next visit.
  }
}

/**
 * The desktop's menu column beside a section, and the one control that folds
 * it away. Folded, the menu is gone rather than shrunk — no rail of icons —
 * and a single button above the section brings it back.
 */
export function SectionColumns({
  nav,
  children,
}: {
  /**
   * A `SectionNav` in its `column` variant, or null when the page has no menu
   * to show — then the section is all there is, and there is nothing to fold.
   */
  nav: ReactNode | null;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(readHidden);

  if (nav === null) return <>{children}</>;

  const toggle = (): void => {
    setHidden(!hidden);
    writeHidden(!hidden);
  };

  const toggleButton = (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-expanded={!hidden}
      onClick={toggle}
      className="self-start"
    >
      {hidden ? t("common.showMenu") : t("common.hideMenu")}
    </Button>
  );

  if (hidden) {
    return (
      <div className="flex flex-col gap-4">
        {toggleButton}
        <div className="min-w-0">{children}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-8">
      {/* The cell stretches to the section beside it; what sticks inside it
          needs that height to travel over. */}
      <div>
        <div className="sticky top-6 flex flex-col gap-2">
          {toggleButton}
          {nav}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export interface SectionNavItem {
  /** Identity used to match the active row. */
  id: string;
  label: string;
  /** Where the row leads — the page itself, with the section in its search. */
  link: LinkProps;
}

/** Kit's list row: a white tile, 54px, no divider and no chevron on desktop. */
const rowBase =
  "flex items-center gap-3 rounded-lg text-left text-[15px] font-semibold transition-colors duration-[120ms] ease-standard";

export function SectionNav({
  label,
  items,
  activeId,
  variant,
}: {
  /** The menu's accessible name. */
  label: string;
  items: readonly SectionNavItem[];
  /** The section on screen, or null on the phone's menu, where none is. */
  activeId: string | null;
  /** `column` is the desktop's sidebar; `list` is the phone's whole page. */
  variant: "column" | "list";
}) {
  return (
    // On the desktop `SectionColumns` makes the column sticky, together with
    // the button that folds it away.
    <nav aria-label={label} className="flex flex-col gap-2">
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <Link
            key={item.id}
            {...item.link}
            aria-current={active ? "page" : undefined}
            className={cn(
              rowBase,
              variant === "column" ? "min-h-11 px-4 py-2" : "min-h-tap-row px-4",
              active
                ? "bg-ink text-white"
                : "bg-card text-foreground hover:bg-accent",
            )}
          >
            <span className="flex-1">{item.label}</span>
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

/**
 * The phone's way back from a section to the menu. It replaces the heading:
 * the section says where you are, and two titles in a row would say it twice.
 */
export function SectionBackLink({
  link,
  label,
}: {
  link: LinkProps;
  label: string;
}) {
  return (
    <Link
      {...link}
      className="min-h-tap -ml-1 flex items-center gap-1 self-start pr-3 pl-1 text-sm font-semibold"
    >
      <ChevronLeftIcon aria-hidden className="size-4" />
      {label}
    </Link>
  );
}
