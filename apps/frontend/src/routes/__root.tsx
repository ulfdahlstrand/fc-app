/**
 * Root route — renders the application shell and the Outlet for child routes.
 * This file is part of the TanStack Router file-based route system.
 *
 * The shell (header + content container) persists across client-side
 * navigations. When signed in, the header shows the club/team switcher and
 * the user with a link to the profile page. Navigation items are added here
 * as feature pages land.
 */
import { useQuery } from "@tanstack/react-query";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { TeamSwitcher } from "../components/TeamSwitcher";
import { meQueryOptions } from "../lib/auth";
import { useHasPermission } from "../lib/clubs";

export const Route = createRootRoute({
  component: RootLayout,
});

const navLinkClass =
  "text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground";

function RootLayout() {
  const { t } = useTranslation();
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  const canViewMembers = useHasPermission("members.view");
  const canManageTeam = useHasPermission("settings.team");
  const canManageClub = useHasPermission("settings.club");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-2">
          <span className="mr-auto text-lg font-semibold">
            {t("app.title")}
          </span>
          {user && (
            <nav className="flex flex-wrap items-center gap-1">
              <TeamSwitcher />
              {canViewMembers && (
                <Button asChild variant="ghost" size="sm" className={navLinkClass}>
                  <Link to="/members">{t("nav.members")}</Link>
                </Button>
              )}
              {canViewMembers && (
                <Button asChild variant="ghost" size="sm" className={navLinkClass}>
                  <Link to="/groups">{t("nav.groups")}</Link>
                </Button>
              )}
              {canManageTeam && (
                <Button asChild variant="ghost" size="sm" className={navLinkClass}>
                  <Link to="/settings/team">{t("nav.teamSettings")}</Link>
                </Button>
              )}
              {canManageClub && (
                <Button asChild variant="ghost" size="sm" className={navLinkClass}>
                  <Link to="/settings/club">{t("nav.clubSettings")}</Link>
                </Button>
              )}
              <Button
                asChild
                variant="ghost"
                size="sm"
                className={`gap-2 ${navLinkClass}`}
              >
                <Link to="/profile">
                  <span className="flex size-7 items-center justify-center overflow-hidden rounded-full bg-primary-foreground/20">
                    {user.imageUrl ? (
                      <img
                        src={user.imageUrl}
                        alt={user.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <UserIcon className="size-4" />
                    )}
                  </span>
                  {user.name}
                </Link>
              </Button>
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
