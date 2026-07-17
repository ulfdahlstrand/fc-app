import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

// Env files (.env, .env.local, …) are read from the repo root so local dev
// shares the same .env as the backend and Docker Compose.
const envDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig(({ mode }) => {
  // Load env vars from the root .env so VITE_PORT is available here.
  const env = loadEnv(mode, envDir, "VITE_");

  return {
    envDir,
    plugins: [
      // TanStack Router Vite plugin: watches src/routes/ and auto-generates
      // src/route-tree.gen.ts on file changes during dev, and once before build.
      TanStackRouterVite({
        routesDirectory: "./src/routes",
        generatedRouteTree: "./src/route-tree.gen.ts",
      }),
      react(),
    ],
    server: {
      port: Number(env["VITE_PORT"] ?? 4173),
    },
  };
});
