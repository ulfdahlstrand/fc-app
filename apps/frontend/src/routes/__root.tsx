/**
 * Root route — renders the application shell and the Outlet for child routes.
 *
 * Kit is a two-layout system with one breakpoint at 700px (the `kit:` variant).
 * Below it the screen is four bands — `MobileTopBar`, one scrolling middle,
 * the page's own save bar, `TabBar` — and only the middle moves. At 700px and
 * up it is the desktop app bar over a normally scrolling document. There is no
 * third arrangement: a tablet gets the desktop shell, centred and capped.
 *
 * Both shells read the same ordered destination list (`lib/navigation.ts`), so
 * the pill nav and the tab bar cannot drift apart.
 */
import { useQuery } from "@tanstack/react-query";
import { createRootRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { UserIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { MenuSheet } from "../components/navigation/MenuSheet";
import { MobileTopBar } from "../components/navigation/MobileTopBar";
import { TabBar, TabBarButton, TabBarLink } from "../components/navigation/TabBar";
import { TeamSwitcher } from "../components/TeamSwitcher";
import { logout, meQueryOptions } from "../lib/auth";
import { useMyCallups } from "../lib/callup-responses";
import { myClubsQueryOptions, selectTeam, useSelectedTeam } from "../lib/clubs";
import { splitForTabBar, visibleDestinations } from "../lib/navigation";

export const Route = createRootRoute({
  component: RootLayout,
});

/**
 * Kit nav pill: idle is transparent on the ink bar, hover fills one step, the
 * active page is a solid white pill. Hover changes background, never opacity.
 *
 * Colours live in `activeProps`/`inactiveProps` rather than in the base class
 * so the two states never both apply. `cn` cannot untangle them here —
 * tailwind-merge does not know `text-ink` is a colour (it comes from `@theme`),
 * so it keeps both and the active pill renders white-on-white.
 */
const navPillClass =
  "inline-flex h-9 items-center rounded-pill px-4 text-sm font-semibold transition-colors duration-[120ms] ease-standard";
const navPillIdle = "text-white/85 hover:bg-ink-raised hover:text-white";
const navPillActive = "bg-white text-ink";

function NavPill({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      // Without this "/" would count as active on every page, since prefix
      // matching makes the root a prefix of all of them.
      activeOptions={{ exact: to === "/" }}
      className={navPillClass}
      activeProps={{ className: cn(navPillClass, navPillActive) }}
      inactiveProps={{ className: cn(navPillClass, navPillIdle) }}
    >
      {children}
    </Link>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? "") : "";
  return (first + last).toUpperCase();
}

function RootLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  const selected = useSelectedTeam();
  const clubs = useQuery(myClubsQueryOptions);
  const callups = useMyCallups({ enabled: Boolean(user) });
  const [menuOpen, setMenuOpen] = useState(false);

  const permissions = selected?.team.permissions ?? [];
  const desktopDestinations = visibleDestinations(permissions);
  const { tabs, sheet } = splitForTabBar(permissions);
  const pendingCallups = callups.data?.pending ?? 0;

  // Call-ups rarely earn a tab, so an unanswered one raises the alert dot on
  // `Menu` instead — which is exactly what Kit's `alert` is for.
  const menuAlert =
    pendingCallups > 0 && !tabs.some((d) => d.to === "/callups");

  // Kit renders the club mark as its initial letter in Anton inside a green
  // disc — the sources contain no logo, and we must not draw a crest.
  const clubName = selected?.club.name ?? t("app.title");
  const clubInitial = clubName.trim().charAt(0).toUpperCase();

  const teams =
    clubs.data?.clubs.flatMap((club) =>
      club.teams.map((team) => ({
        id: team.id,
        name: team.name,
        clubName: club.name,
      })),
    ) ?? [];

  const handleSignOut = async () => {
    await logout();
    await navigate({ to: "/login" });
  };

  return (
    <div
      className={cn(
        // Phone: a fixed frame whose middle band is the only thing that
        // scrolls. Desktop: an ordinary document.
        "flex h-dvh flex-col overflow-hidden",
        "kit:h-auto kit:min-h-screen kit:overflow-visible",
      )}
    >
      {/* Desktop: one fixed ink app bar, no sidebar. */}
      <header className="bg-ink hidden text-white kit:block">
        <div className="mx-auto flex min-h-16 w-full max-w-[1100px] flex-wrap items-center gap-7 px-[var(--gutter)] py-[18px]">
          <Link to="/" className="flex items-center gap-3">
            <span className="bg-brand flex size-8 items-center justify-center rounded-full font-display text-[17px] leading-none text-white">
              {clubInitial}
            </span>
            <span className="font-display text-[19px] tracking-[0.4px]">
              {clubName}
            </span>
          </Link>
          {user && (
            <nav className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {desktopDestinations
                .filter((d) => d.group === "team")
                .map((d) => (
                  <NavPill key={d.to} to={d.to}>
                    {t(`nav.${d.labelKey}`)}
                  </NavPill>
                ))}
              {desktopDestinations.some((d) => d.group === "club") && (
                <span aria-hidden className="bg-ink-raised mx-1 h-5 w-px" />
              )}
              {desktopDestinations
                .filter((d) => d.group === "club")
                .map((d) => (
                  <NavPill key={d.to} to={d.to}>
                    {t(`nav.${d.labelKey}`)}
                  </NavPill>
                ))}
              <TeamSwitcher />
              <Link
                to="/profile"
                className={cn(navPillClass, "gap-2 pl-1.5")}
                activeProps={{
                  className: cn(navPillClass, navPillActive, "gap-2 pl-1.5"),
                }}
                inactiveProps={{
                  className: cn(navPillClass, navPillIdle, "gap-2 pl-1.5"),
                }}
              >
                <span className="bg-ink-raised flex size-7 items-center justify-center overflow-hidden rounded-full">
                  {user.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={user.name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <UserIcon className="size-4 text-white" />
                  )}
                </span>
                {user.name}
              </Link>
            </nav>
          )}
        </div>
      </header>

      {/* Phone: identity and the team pill only — sections live in the tab bar. */}
      <div className="kit:hidden">
        <MobileTopBar
          clubName={clubName}
          clubInitial={clubInitial}
          teamName={user ? (selected?.team.name ?? null) : null}
          onTeam={() => setMenuOpen(true)}
        />
      </div>

      <main
        className={cn(
          "mx-auto w-full max-w-[1100px] flex-1 px-[var(--gutter)] py-8",
          // The middle band, and the only one that scrolls.
          "overflow-y-auto kit:overflow-visible",
        )}
      >
        <Outlet />
      </main>

      {user && (
        <div className="kit:hidden">
          <TabBar>
            {tabs.map((d) => (
              <TabBarLink key={d.to} to={d.to} exact={d.to === "/"}>
                {t(`nav.${d.labelKey}`)}
              </TabBarLink>
            ))}
            <TabBarButton
              onClick={() => setMenuOpen(true)}
              active={menuOpen}
              alert={menuAlert}
            >
              {t("nav.menu")}
            </TabBarButton>
          </TabBar>
        </div>
      )}

      {user && (
        <MenuSheet
          open={menuOpen}
          onOpenChange={setMenuOpen}
          destinations={sheet}
          teams={teams}
          activeTeamId={selected?.team.id ?? null}
          onSelectTeam={selectTeam}
          userName={user.name}
          userMeta={selected ? selected.team.name : null}
          userInitials={initialsOf(user.name)}
          pendingCallups={pendingCallups}
          onSignOut={handleSignOut}
        />
      )}
    </div>
  );
}
