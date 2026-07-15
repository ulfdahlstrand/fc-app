/**
 * Application root component.
 *
 * Mounts the global providers in order:
 *   ThemeProvider (MUI) → QueryClientProvider (TanStack Query) → RouterProvider (TanStack Router)
 */
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { theme } from "./lib/theme";
import { queryClient } from "./query-client";
import { router } from "./router";

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
