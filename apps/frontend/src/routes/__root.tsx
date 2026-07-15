/**
 * Root route — renders the application shell and the Outlet for child routes.
 * This file is part of the TanStack Router file-based route system.
 *
 * The shell (AppBar + content container) persists across client-side
 * navigations. Navigation items are added here as feature pages land.
 */
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { t } = useTranslation();

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div">
            {t("app.title")}
          </Typography>
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
