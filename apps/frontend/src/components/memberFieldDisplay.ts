/** Formats a custom field value for display, by field type. */
import type { MemberFieldDefinition } from "@fc-app/contracts";
import type { TFunction } from "i18next";

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
