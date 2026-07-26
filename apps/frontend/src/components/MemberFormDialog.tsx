/**
 * Create/edit dialog for a member (issue #7). Shared by the roster list (new
 * member) and the detail page (edit).
 *
 * Reference implementation of the form pattern (issue #32): react-hook-form +
 * zodResolver, validating against the *contract* schema
 * (`createMemberInputSchema`, minus the server-supplied `teamId`) so client and
 * API validation never drift. Messages are localized via `zodErrorMap`.
 */
import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { createMemberInputSchema, type Member } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { zodErrorMap } from "@/lib/zod-i18n";
import type { MemberWriteInput } from "../lib/members";

// The write fields are exactly the create-member contract input without the
// server-derived team id — the single source of truth for the form's rules.
const memberFormSchema = createMemberInputSchema.omit({ teamId: true });
type MemberFormValues = z.infer<typeof memberFormSchema>;

export function MemberFormDialog({
  member,
  saving,
  error,
  onSave,
  onClose,
}: {
  member?: Member;
  saving: boolean;
  error: boolean;
  onSave: (input: MemberWriteInput) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const resolver = useMemo(
    () => zodResolver(memberFormSchema, { error: zodErrorMap(t) }),
    [t]
  );

  const form = useForm<MemberFormValues>({
    resolver,
    defaultValues: {
      firstName: member?.firstName ?? "",
      lastName: member?.lastName ?? "",
      birthYear: member?.birthYear ?? null,
      email: member?.email ?? null,
      phone: member?.phone ?? null,
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    onSave({
      firstName: values.firstName,
      lastName: values.lastName,
      birthYear: values.birthYear ?? null,
      email: values.email ?? null,
      phone: values.phone ?? null,
    });
  });

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {member ? t("members.editTitle") : t("members.newTitle")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="grid gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{t("members.saveError")}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("members.firstName")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      maxLength={100}
                      autoFocus
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("members.lastName")}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} maxLength={100} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="birthYear"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("members.birthYear")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={field.value ?? ""}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === ""
                            ? null
                            : event.target.valueAsNumber
                        )
                      }
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("members.email")}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      value={field.value ?? ""}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === "" ? null : event.target.value
                        )
                      }
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("members.phone")}</FormLabel>
                  <FormControl>
                    <Input
                      value={field.value ?? ""}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === "" ? null : event.target.value
                        )
                      }
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("common.close")}
              </Button>
              <Button type="submit" disabled={saving}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
