import { z } from "zod";

// ---------------------------------------------------------------------------
// Query-string-safe boolean
//
// oRPC's OpenAPI layer does not coerce GET query parameters against the
// contract's Zod types — a query string can only carry text, so a plain
// value sent as `?includeArchived=true` arrives server-side as the string
// "true", not a boolean, and `z.boolean()` rejects it (BAD_REQUEST). This
// accepts a real boolean (handlers called directly, e.g. in tests) as well
// as the "true"/"false" strings the oRPC client actually puts on the wire
// for GET requests, and normalizes both to a boolean.
// ---------------------------------------------------------------------------

export const queryBooleanSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value === "true"
        ? true
        : value === "false"
          ? false
          : value
      : value,
  z.boolean()
);

// ---------------------------------------------------------------------------

/** An ISO 8601 instant carrying a zone — "…Z" or "…+02:00". */
export const isoInstantSchema = z.iso.datetime({ offset: true });
