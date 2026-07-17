// ---------------------------------------------------------------------------
// Minimal cookie helpers — enough for the session and OAuth-state cookies,
// avoiding an extra dependency.
// ---------------------------------------------------------------------------

export function parseCookies(
  header: string | undefined
): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

export interface CookieOptions {
  /** Absolute expiry. Omit for a session cookie; a past date clears it. */
  expires?: Date;
  maxAgeSeconds?: number;
}

/**
 * Serializes an HTTP-only, SameSite=Lax cookie. `Secure` is added when
 * COOKIE_SECURE=true (production behind HTTPS); localhost dev works without.
 */
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {}
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.maxAgeSeconds !== undefined)
    parts.push(`Max-Age=${options.maxAgeSeconds}`);
  if (process.env["COOKIE_SECURE"] === "true") parts.push("Secure");
  return parts.join("; ");
}

/** A cookie string that immediately expires (clears) the named cookie. */
export function clearCookie(name: string): string {
  return serializeCookie(name, "", { expires: new Date(0) });
}
