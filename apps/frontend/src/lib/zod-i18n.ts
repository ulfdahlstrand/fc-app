/**
 * Localizes Zod validation issues at the form layer.
 *
 * The shared contract schemas (`@fc-app/contracts`) carry Zod's default
 * (English) messages. Instead of duplicating the validation *rules* with
 * translated copies, we pass this error map to `zodResolver`, so the exact
 * same schema the backend enforces produces localized messages on the client.
 * Rules stay in one place; only the presentation is translated.
 *
 * Usage:
 *   const { t } = useTranslation();
 *   const resolver = useMemo(
 *     () => zodResolver(schema, { error: zodErrorMap(t) }),
 *     [t],
 *   );
 */
import type { TFunction } from "i18next";

/**
 * A loose view of a Zod v4 issue — every field optional so this stays
 * assignable to `zodResolver`'s `error` callback regardless of which issue
 * union member is passed at runtime.
 */
type ZodIssueLike = {
  code?: string;
  origin?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  format?: string;
};

export function zodErrorMap(
  t: TFunction
): (issue: ZodIssueLike) => string | undefined {
  return (issue) => {
    switch (issue.code) {
      case "too_small":
        // A string min (e.g. `.min(1)`) reads as "required"; a numeric min is
        // a lower bound (e.g. birth year ≥ 1900).
        return issue.origin === "string"
          ? t("validation.required")
          : t("validation.min", { min: Number(issue.minimum) });
      case "too_big":
        return issue.origin === "string"
          ? t("validation.maxLength", { max: Number(issue.maximum) })
          : t("validation.max", { max: Number(issue.maximum) });
      case "invalid_format":
        return issue.format === "email"
          ? t("validation.email")
          : t("validation.invalid");
      case "invalid_type":
        // A missing/blank required value, or a non-number where one is expected.
        return t("validation.required");
      default:
        // Fall back to Zod's default message for anything not mapped.
        return undefined;
    }
  };
}
