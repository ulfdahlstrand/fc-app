/**
 * The desktop user menu — the app bar's answer to `MenuSheet`. The trigger is
 * who you are and, beneath the name, which team you are looking at; the menu
 * holds everything that is about you or the team rather than a section of it:
 * profile, the team switch, team and club settings, and sign out.
 *
 * Settings used to be pills beside the sections, and the team a select beside
 * those. Both are things a coach visits rarely and a player never, so they
 * stood in the nav at the cost of the sections that are used every day.
 *
 * Desktop only: on a phone a choice is a sheet (DDR-010), and `MenuSheet`
 * already carries the same contents there.
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link } from "@tanstack/react-router";
import { CheckIcon, ChevronDownIcon, UserIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Destination } from "@/lib/navigation";

export interface MenuClub {
  id: string;
  name: string;
  teams: { id: string; name: string }[];
}

const itemClass =
  "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground";

function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Label className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-semibold">
      {children}
    </DropdownMenu.Label>
  );
}

function Separator() {
  return <DropdownMenu.Separator className="bg-border -mx-1 my-1 h-px" />;
}

export function UserMenu({
  userName,
  userImageUrl,
  teamName,
  clubs,
  activeTeamId,
  onSelectTeam,
  destinations,
  onSignOut,
}: {
  userName: string;
  userImageUrl: string | null;
  teamName: string | null;
  clubs: MenuClub[];
  activeTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
  /** Destinations that live here rather than in the nav — the `club` group. */
  destinations: Destination[];
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const teamCount = clubs.reduce((sum, club) => sum + club.teams.length, 0);
  const multipleClubs = clubs.length > 1;

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className={cn(
          "flex min-h-9 items-center gap-2 rounded-pill py-1 pr-3 pl-1.5 text-left text-white/85 outline-none",
          "transition-colors duration-[120ms] ease-standard hover:bg-ink-raised hover:text-white",
          "focus-visible:ring-ring/50 focus-visible:ring-[3px] data-[state=open]:bg-ink-raised data-[state=open]:text-white",
        )}
      >
        <span className="bg-ink-raised flex size-8 flex-none items-center justify-center overflow-hidden rounded-full">
          {userImageUrl ? (
            <img src={userImageUrl} alt="" className="size-full object-cover" />
          ) : (
            <UserIcon className="size-4 text-white" />
          )}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-sm font-semibold">{userName}</span>
          {teamName && (
            <span className="text-xs font-medium text-white/60">{teamName}</span>
          )}
        </span>
        <ChevronDownIcon aria-hidden className="size-4 opacity-60" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            "bg-popover text-popover-foreground z-50 min-w-56 overflow-y-auto rounded-md border p-1 shadow-md",
            "max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin)",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <DropdownMenu.Item asChild className={itemClass}>
            <Link to="/profile">{t("nav.profile")}</Link>
          </DropdownMenu.Item>

          {teamCount > 0 && (
            <>
              <Separator />
              <MenuLabel>{t("switcher.label")}</MenuLabel>
              <DropdownMenu.RadioGroup
                value={activeTeamId ?? ""}
                onValueChange={onSelectTeam}
              >
                {clubs.map((club) => (
                  <DropdownMenu.Group key={club.id}>
                    {multipleClubs && (
                      <DropdownMenu.Label className="text-muted-foreground px-2 pt-1.5 pb-0.5 text-xs">
                        {club.name}
                      </DropdownMenu.Label>
                    )}
                    {club.teams.map((team) => (
                      <DropdownMenu.RadioItem
                        key={team.id}
                        value={team.id}
                        className={cn(itemClass, "pr-8 relative")}
                      >
                        {team.name}
                        <DropdownMenu.ItemIndicator className="absolute right-2 flex items-center">
                          <CheckIcon className="size-4" />
                        </DropdownMenu.ItemIndicator>
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.Group>
                ))}
              </DropdownMenu.RadioGroup>
            </>
          )}

          {destinations.length > 0 && (
            <>
              <Separator />
              {destinations.map((d) => (
                <DropdownMenu.Item key={d.to} asChild className={itemClass}>
                  <Link to={d.to}>{t(`nav.${d.labelKey}`)}</Link>
                </DropdownMenu.Item>
              ))}
            </>
          )}

          <Separator />
          <DropdownMenu.Item className={itemClass} onSelect={onSignOut}>
            {t("profile.logout")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
