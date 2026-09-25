/** One labelled input on a sign-in form, with the browser's autofill hints. */
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export function AuthTextField<T extends FieldValues>({
  control,
  name,
  label,
  type = "text",
  autoComplete,
  description,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  type?: "text" | "email" | "password";
  /** Tells password managers what to fill — or, with `new-password`, to suggest. */
  autoComplete: string;
  description?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={type}
              autoComplete={autoComplete}
              autoCapitalize={type === "text" ? undefined : "none"}
              spellCheck={false}
              {...field}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
