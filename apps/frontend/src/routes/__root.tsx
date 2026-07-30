/** Root route — renders the application shell and the Outlet for child routes. */
import { useQuery } from "@tanstack/react-query";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { UserIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TeamSwitcher } from "../components/TeamSwitcher";
import { meQueryOptions } from "../lib/auth";
import { useHasPermission, useSelectedTeam } from "../lib/clubs";

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
      className={navPillClass}
      activeProps={{ className: cn(navPillClass, navPillActive) }}
      inactiveProps={{ className: cn(navPillClass, navPillIdle) }}
    >
      {children}
    </Link>
  );
}

function RootLayout() {
  const { t } = useTranslation();
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  const selected = useSelectedTeam();
  const canViewMembers = useHasPermission("members.view");
  const canRespond = useHasPermission("callups.respond");
  const canManageTeam = useHasPermission("settings.team");
  const canManageClub = useHasPermission("settings.club");

  // Kit renders the club mark as its initial letter in Anton inside a green
  // disc — the sources contain no logo, and we must not draw a crest.
  const clubName = selected?.club.name ?? t("app.title");
  const clubInitial = clubName.trim().charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col">
      {/* One fixed ink app bar, no sidebar. */}
      <header className="bg-ink text-white">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center gap-7 px-[30px] py-[18px]">
          <Link to="/" className="flex items-center gap-3">
            <span className="bg-brand flex size-8 items-center justify-center rounded-full font-display text-[17px] leading-none text-white">
              {clubInitial}
            </span>
            <span className="font-display text-[19px] tracking-[0.4px]">
              {clubName}
            </span>
          </Link>
          {user && (
            <nav className="ml-auto flex flex-wrap items-center gap-2">
              <TeamSwitcher />
              {canViewMembers && (
                <NavPill to="/activities">{t("nav.activities")}</NavPill>
              )}
              {canViewMembers && (
                <NavPill to="/members">{t("nav.members")}</NavPill>
              )}
              {canViewMembers && (
                <NavPill to="/groups">{t("nav.groups")}</NavPill>
              )}
              {/* Call-ups are for whoever is asked as well as whoever asks,
                  so this is the one nav item a player also sees. */}
              {(canViewMembers || canRespond) && (
                <NavPill to="/callups">{t("nav.callups")}</NavPill>
              )}
              {/* The noticeboard is for everyone in the team, not just whoever
                  can see the roster — being announced to needs no permission. */}
              <NavPill to="/posts">{t("nav.posts")}</NavPill>
              {canViewMembers && (
                <NavPill to="/statistics">{t("nav.statistics")}</NavPill>
              )}
              {canViewMembers && (
                <NavPill to="/tracking">{t("nav.tracking")}</NavPill>
              )}
              {canManageTeam && (
                <NavPill to="/settings/team">{t("nav.teamSettings")}</NavPill>
              )}
              {canManageClub && (
                <NavPill to="/settings/club">{t("nav.clubSettings")}</NavPill>
              )}
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-[30px] py-8">
        <Outlet />
      </main>
    </div>
  );
}
