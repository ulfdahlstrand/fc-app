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
import { useTranslation } from "react-i18next";
import { TeamSwitcher } from "@/components/TeamSwitcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { meQueryOptions } from "@/lib/auth";
import { useHasPermission } from "@/lib/clubs";

export const Route = createRootRoute({
  component: RootLayout,
});

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

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
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4">
          <span className="flex-1 text-lg font-semibold">{t("app.title")}</span>
          {user && (
            <>
              <TeamSwitcher />
              {canViewMembers && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/members">{t("nav.members")}</Link>
                </Button>
              )}
              {canViewMembers && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/groups">{t("nav.groups")}</Link>
                </Button>
              )}
              {canManageTeam && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/settings/team">{t("nav.teamSettings")}</Link>
                </Button>
              )}
              {canManageClub && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/settings/club">{t("nav.clubSettings")}</Link>
                </Button>
              )}
              <Button variant="ghost" size="sm" asChild>
                <Link to="/profile" className="gap-2">
                  <Avatar className="size-7">
                    {user.imageUrl && (
                      <AvatarImage src={user.imageUrl} alt={user.name} />
                    )}
                    <AvatarFallback>{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  {user.name}
                </Link>
              </Button>
            </>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
