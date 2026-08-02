// Minimal cookie helpers — enough for the session and OAuth-state cookies,
// avoiding an extra dependency.

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
 * Serializes an HTTP-only cookie.
 *
 * SameSite follows the deployment shape (ADR-020). Deployed, the SPA and the
 * API are separate hosts, so the session cookie is cross-site and `Lax` would
 * stop the browser attaching it to the SPA's fetches — sign-in would appear to
 * succeed and every later request would be anonymous. `None` is required, and
 * browsers only honour it alongside `Secure`; the two are therefore driven by
 * the single COOKIE_SECURE flag so they cannot drift apart.
 */
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {}
): string {
  const crossSite = process.env["COOKIE_SECURE"] === "true";
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    crossSite ? "SameSite=None" : "SameSite=Lax",
  ];
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.maxAgeSeconds !== undefined)
    parts.push(`Max-Age=${options.maxAgeSeconds}`);
  if (crossSite) parts.push("Secure");
  return parts.join("; ");
}

/** A cookie string that immediately expires (clears) the named cookie. */
export function clearCookie(name: string): string {
  return serializeCookie(name, "", { expires: new Date(0) });
}
