/** Where the API lives, as seen from the browser. */

/**
 * Resolves VITE_API_URL against the page's origin, so the value may be either
 * absolute (`http://localhost:4001` in development) or a path. Deployed it is
 * the path `/api`, which the static site rewrites to the API service (ADR-021)
 * — that keeps the session cookie first-party. Absolute is also what oRPC's
 * `OpenAPILink` needs; it feeds the base URL straight to `new URL()`.
 */
export function getApiUrl(): string {
  const configured: string = import.meta.env["VITE_API_URL"] ?? "";
  return new URL(configured, globalThis.location.origin).href.replace(
    /\/$/,
    ""
  );
}
