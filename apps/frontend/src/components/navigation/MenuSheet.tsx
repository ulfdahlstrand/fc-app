/**
 * The mobile menu (Kit `MenuSheet`). Everything that does not earn a tab lives
 * here: who you are signed in as, which team you are looking at, the team- and
 * club-level destinations, and sign out.
 *
 * It slides up in 180ms on Kit's standard curve with the scrim fading
 * alongside, caps at 88% height, and is dismissible by tapping away. That 45%
 * ink scrim is the only translucent surface Kit permits and exists for this
 * component alone.
 *
 * Rows are separate white tiles with an 8px gap — Kit has no dividers, so a
 * list is a stack of surfaces. No chevrons either: the right-hand slot is a
 * fact (a count, a state), not decoration.
 *
 * Built on Radix's Dialog so focus trapping, Escape and scroll locking come
 * for free; only the presentation is Kit's.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Destination } from "@/lib/navigation";

export interface SheetTeam {
  id: string;
  name: string;
  clubName: string;
}

function SheetGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-none flex-col gap-[9px]">
      <span className="kit-overline">{title}</span>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

/** A row in the sheet: a white tile, 54px, with an optional fact on the right. */
const rowClass =
  "bg-card flex min-h-tap-row items-center gap-3 rounded-lg px-4 text-left text-[15px] font-semibold transition-colors duration-[120ms] ease-standard hover:bg-accent";

function SheetMeta({ children, alert }: { children: ReactNode; alert?: boolean }) {
  return (
    <span
      className={cn(
        "text-[13px]",
        alert ? "text-absent font-bold" : "text-muted-foreground font-medium",
      )}
    >
      {children}
    </span>
  );
}

export function MenuSheet({
  open,
  onOpenChange,
  destinations,
  teams,
  activeTeamId,
  onSelectTeam,
  userName,
  userMeta,
  userInitials,
  pendingCallups,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destinations: Destination[];
  teams: SheetTeam[];
  activeTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
  userName: string;
  userMeta: string | null;
  userInitials: string;
  pendingCallups: number;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const close = () => onOpenChange(false);

  const team = destinations.filter((d) => d.group === "team");
  const club = destinations.filter((d) => d.group === "club");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 duration-[180ms]"
          style={{ background: "var(--sheet-scrim)" }}
        />
        <DialogPrimitive.Content
          className={cn(
            "bg-background fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 overflow-y-auto rounded-t-xl px-[var(--gutter)] pt-[10px] pb-[26px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-[180ms] ease-standard",
          )}
          style={{ maxHeight: "var(--sheet-max-height)" }}
        >
          <DialogPrimitive.Title className="sr-only">
            {t("nav.menu")}
          </DialogPrimitive.Title>

          <span
            aria-hidden
            className="bg-neutral-300 h-[5px] w-11 flex-none self-center rounded-[5px]"
          />

          <Link
            to="/profile"
            onClick={close}
            className={cn(rowClass, "flex-none")}
          >
            <span className="bg-ink text-[15px] flex size-11 flex-none items-center justify-center rounded-full font-semibold text-white">
              {userInitials}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{userName}</span>
              {userMeta && (
                <span className="text-muted-foreground text-[13px] font-normal">
                  {userMeta}
                </span>
              )}
            </span>
          </Link>

          {teams.length > 1 && (
            <SheetGroup title={t("switcher.label")}>
              {/* Pills, not a select: on a phone a choice is a sheet, and this
                  already is one. `flex-wrap` rather than a scrolling row —
                  a club's teams are few and all of them should be visible. */}
              <div className="flex flex-wrap gap-2">
                {teams.map((team) => {
                  const active = team.id === activeTeamId;
                  return (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => {
                        onSelectTeam(team.id);
                        close();
                      }}
                      className={cn(
                        "min-h-tap rounded-pill px-4 text-[13px] font-semibold whitespace-nowrap transition-colors duration-[120ms] ease-standard",
                        active
                          ? "bg-ink text-white"
                          : "bg-card text-foreground hover:bg-accent",
                      )}
                    >
                      {team.name}
                    </button>
                  );
                })}
              </div>
            </SheetGroup>
          )}

          {team.length > 0 && (
            <SheetGroup title={t("nav.menuTeam")}>
              {team.map((d) => (
                <Link
                  key={d.to}
                  to={d.to}
                  onClick={close}
                  className={rowClass}
                >
                  <span className="flex-1">{t(`nav.${d.labelKey}`)}</span>
                  {d.to === "/callups" && pendingCallups > 0 && (
                    <SheetMeta alert>{pendingCallups}</SheetMeta>
                  )}
                </Link>
              ))}
            </SheetGroup>
          )}

          {club.length > 0 && (
            <SheetGroup title={t("nav.menuClub")}>
              {club.map((d) => (
                <Link
                  key={d.to}
                  to={d.to}
                  onClick={close}
                  className={rowClass}
                >
                  <span className="flex-1">{t(`nav.${d.labelKey}`)}</span>
                </Link>
              ))}
            </SheetGroup>
          )}

          <Button
            variant="outline"
            onClick={() => {
              close();
              onSignOut();
            }}
            className="min-h-tap w-full flex-none"
          >
            {t("profile.logout")}
          </Button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
