import { z } from "zod";

// Auth — Zod schemas
//
// `me` returns the signed-in user derived from the session cookie, or null.
// Sign-in itself is a browser redirect flow (GET /auth/google →
// /auth/google/callback) and logout is POST /auth/logout — plain HTTP
// endpoints on the backend, since they set/clear cookies and redirect.
// ---------------------------------------------------------------------------

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  imageUrl: z.string().nullable(),
});

export type User = z.infer<typeof userSchema>;

export const meInputSchema = z.object({});

export const meOutputSchema = z.object({
  user: userSchema.nullable(),
});

// ---------------------------------------------------------------------------
