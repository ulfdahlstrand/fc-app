/**
 * A custom field value, read-only. Booleans read as a coloured pill so a
 * column of yes/no can be scanned at a glance; every other type is the plain
 * text `formatFieldValue` gives. An unset boolean stays a dash, not a pill —
 * nobody has said yet is not a "no".
 */
import { useTranslation } from "react-i18next";
import type { MemberFieldDefinition } from "@fc-app/contracts";
import { Badge } from "@/components/ui/badge";
import { formatFieldValue } from "./memberFieldDisplay";

export function MemberFieldValue({
  field,
  raw,
}: {
  field: MemberFieldDefinition;
  raw: string | undefined;
}) {
  const { t } = useTranslation();
  const text = formatFieldValue(field, raw, t);
  if (field.fieldType !== "boolean" || raw === undefined || raw === "") {
    return <>{text}</>;
  }
  return (
    <Badge variant={raw === "true" ? "present" : "absent"}>{text}</Badge>
  );
}
