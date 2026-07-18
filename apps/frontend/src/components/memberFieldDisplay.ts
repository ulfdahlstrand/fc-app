import type { MemberFieldDefinition } from "@fc-app/contracts";
import type { TFunction } from "i18next";

/**
 * Formats a stored raw field value for display. Booleans become localized
 * yes/no; everything else shows as-is. Empty/missing renders as an em dash.
 */
export function formatFieldValue(
  field: MemberFieldDefinition,
  raw: string | undefined,
  t: TFunction
): string {
  if (raw === undefined || raw === "") return "—";
  if (field.fieldType === "boolean") {
    return raw === "true" ? t("common.yes") : t("common.no");
  }
  return raw;
}
