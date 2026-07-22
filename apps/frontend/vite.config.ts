import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Env files (.env, .env.local, …) are read from the repo root so local dev
// shares the same .env as the backend and Docker Compose.
const envDir = path.resolve(rootDir, "../..");

export default defineConfig(({ mode }) => {
  // Load env vars from the root .env so VITE_PORT is available here.
  const env = loadEnv(mode, envDir, "VITE_");

  return {
    envDir,
    resolve: {
      // `@/…` maps to the frontend src root (shadcn/ui convention). Kept in
      // sync with the `paths` entry in tsconfig.json.
      alias: {
        "@": path.resolve(rootDir, "src"),
      },
    },
    plugins: [
      // TanStack Router Vite plugin: watches src/routes/ and auto-generates
      // src/route-tree.gen.ts on file changes during dev, and once before build.
      TanStackRouterVite({
        routesDirectory: "./src/routes",
        generatedRouteTree: "./src/route-tree.gen.ts",
      }),
      react(),
      // Tailwind CSS v4 — CSS-first config, tokens live in src/styles/globals.css.
      tailwindcss(),
    ],
    server: {
      port: Number(env["VITE_PORT"] ?? 4173),
    },
  };
});
