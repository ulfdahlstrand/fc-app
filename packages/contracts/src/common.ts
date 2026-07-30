/** Primitives shared across the contract. */

import { z } from "zod";

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

/** An ISO 8601 instant carrying a zone — "…Z" or "…+02:00". */
export const isoInstantSchema = z.iso.datetime({ offset: true });
