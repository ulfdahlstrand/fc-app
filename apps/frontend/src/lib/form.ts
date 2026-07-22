/**
 * Form foundation: react-hook-form + Zod derived from the API contract (ADR-007).
 *
 * The pattern every form in this app follows:
 *
 * 1. Build a *form schema* from `@fc-app/contracts` write fields, wrapping each
 *    one with the helpers below. HTML inputs always produce strings, so the
 *    helpers trim, map "" to null and coerce numbers, then `.pipe()` into the
 *    contract field — the rules (lengths, ranges, email format) live in the
 *    contract only, never restated here.
 * 2. Type the form with `z.input<typeof schema>` (what the inputs hold) and
 *    `z.output<typeof schema>` (what the API takes). `handleSubmit` receives
 *    the parsed output, so no manual trimming/parsing at the call site.
 * 3. Create the resolver with `useZodResolver(schema, "<i18n prefix>")` and
 *    render fields with the `components/ui/form` primitives.
 *
 * Error messages are translated in the resolver, looked up in this order:
 *   `<prefix>.<field>.<zod issue code>` → `validation.<zod issue code>` →
 *   Zod's own English message (last-resort fallback).
 * That keeps validation rules in the contract and their wording in i18n.
 */
import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

/** A required text input: trims, then validates against the contract field. */
export function requiredText<T extends z.ZodType<unknown, string>>(field: T) {
  return z.string().trim().pipe(field);
}

/** An optional text input: trims and treats an empty input as `null`. */
export function optionalText<T extends z.ZodType<unknown, string | null>>(
  field: T,
) {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .pipe(field);
}

/** An optional numeric input: trims, treats an empty input as `null`. */
export function optionalNumber<T extends z.ZodType<unknown, number | null>>(
  field: T,
) {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Number(value)))
    .pipe(field);
}

type Translate = (key: string, options: { defaultValue: string }) => string;

/**
 * Rewrites the resolver's messages to translated ones. Zod's issue code is
 * exposed by `zodResolver` as the error's `type`, which is what we key on.
 */
function translateErrors<TFieldValues extends FieldValues>(
  errors: FieldErrors<TFieldValues>,
  t: Translate,
  messagePrefix: string | undefined,
): FieldErrors<TFieldValues> {
  const translated: Record<string, unknown> = {};

  for (const [name, error] of Object.entries(errors)) {
    if (!error || typeof error !== "object" || !("type" in error)) {
      translated[name] = error;
      continue;
    }

    const code = String(error.type ?? "custom");
    const fallback = String(error.message ?? "");
    const generic = t(`validation.${code}`, { defaultValue: fallback });
    const message = messagePrefix
      ? t(`${messagePrefix}.${name}.${code}`, { defaultValue: generic })
      : generic;

    translated[name] = { ...error, message };
  }

  return translated as FieldErrors<TFieldValues>;
}

/**
 * A `zodResolver` that validates against `schema` and translates the messages.
 *
 * `messagePrefix` scopes field-specific wording, e.g. `"members.validation"`
 * resolves `members.validation.birthYear.too_small` before falling back to the
 * generic `validation.too_small`.
 */
export function useZodResolver<
  TSchema extends z.ZodType<FieldValues, FieldValues>,
>(
  schema: TSchema,
  messagePrefix?: string,
): Resolver<z.input<TSchema>, unknown, z.output<TSchema>> {
  const { t } = useTranslation();

  return useMemo(() => {
    const resolve = zodResolver(schema) as Resolver<
      z.input<TSchema>,
      unknown,
      z.output<TSchema>
    >;

    return async (values, context, options) => {
      const result = await resolve(values, context, options);

      if (Object.keys(result.errors).length === 0) {
        return result;
      }

      return {
        values: {},
        errors: translateErrors<z.input<TSchema>>(
          result.errors,
          t,
          messagePrefix,
        ),
      };
    };
  }, [schema, t, messagePrefix]);
}
