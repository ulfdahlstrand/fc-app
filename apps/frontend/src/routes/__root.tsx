/**
 * Root route — renders the application shell and the Outlet for child routes.
 * This file is part of the TanStack Router file-based route system.
 *
 * The shell (AppBar + content container) persists across client-side
 * navigations. When signed in, the AppBar shows the club/team switcher and
 * the user with a link to the profile page. Navigation items are added here
 * as feature pages land.
 */
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { TeamSwitcher } from "../components/TeamSwitcher";
import { meQueryOptions } from "../lib/auth";
import { useHasPermission } from "../lib/clubs";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { t } = useTranslation();
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  const canManageClub = useHasPermission("settings.club");

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {t("app.title")}
          </Typography>
          {user && (
            <>
              <TeamSwitcher />
              {canManageClub && (
                <Button color="inherit" component={Link} to="/settings/club">
                  {t("nav.clubSettings")}
                </Button>
              )}
              <Button
                color="inherit"
                component={Link}
                to="/profile"
                startIcon={
                  <Avatar
                    {...(user.imageUrl ? { src: user.imageUrl } : {})}
                    alt={user.name}
                    sx={{ width: 28, height: 28 }}
                  />
                }
              >
                {user.name}
              </Button>
            </>
          )}
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
