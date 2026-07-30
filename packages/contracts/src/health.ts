/** Health probe. Explicit GET so `curl /health` works for the Docker healthcheck. */

import { z } from "zod";

// Health procedure — Zod schemas

export const healthInputSchema = z.object({
  echo: z.string().optional(),
});

export const healthOutputSchema = z.object({
  status: z.literal("ok"),
  echo: z.string().optional(),
});

