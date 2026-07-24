/**
 * Create/edit dialog for a member (issue #7).
 *
 * Reference implementation of the form pattern from ADR-007: react-hook-form
 * with a Zod schema derived from the API contract (`memberFormSchema`), shadcn
 * dialog/form primitives, and translated validation messages. New forms should
 * follow this shape — see `lib/form.ts`.
 */
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { Member } from "@fc-app/contracts";
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
import { useZodResolver } from "@/lib/form";
import {
  memberFormSchema,
  type MemberFormValues,
  type MemberWriteInput,
} from "@/lib/members";

function defaultValues(member?: Member): MemberFormValues {
  return {
    firstName: member?.firstName ?? "",
    lastName: member?.lastName ?? "",
    birthYear: member?.birthYear != null ? String(member.birthYear) : "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
  };
}

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
  const form = useForm<MemberFormValues, unknown, MemberWriteInput>({
    resolver: useZodResolver(memberFormSchema, "members.validation"),
    defaultValues: defaultValues(member),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {member ? t("members.editTitle") : t("members.newTitle")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            id="member-form"
            className="grid gap-4"
            onSubmit={form.handleSubmit(onSave)}
            noValidate
          >
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
                    <Input maxLength={100} {...field} />
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
                    <Input maxLength={100} {...field} />
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
                    <Input inputMode="numeric" {...field} />
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
                    <Input type="email" {...field} />
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
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button type="submit" form="member-form" disabled={saving}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
