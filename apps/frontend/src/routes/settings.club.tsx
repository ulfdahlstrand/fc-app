/**
 * Club settings — roles & permissions (issue #5).
 *
 * Only reachable with the settings.club permission in the selected club.
 * Lists the club's roles, allows creating/renaming custom roles and toggling
 * their permissions, and deleting unused custom roles. The Admin role is
 * shown read-only (it always holds every permission).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PERMISSIONS, type Permission, type Role } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { InvitationsSection } from "../components/InvitationsSection";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, myClubsQueryOptions } from "../lib/clubs";
import { useZodResolver } from "../lib/form";
import {
  roleFormSchema,
  useCreateRole,
  useDeleteRole,
  useRoles,
  useUpdateRole,
  type RoleFormValues,
  type RoleNameInput,
} from "../lib/roles";

export const Route = createFileRoute("/settings/club")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: ClubSettingsPage,
});

function ClubSettingsPage() {
  const { t } = useTranslation();
  const clubs = useQuery(myClubsQueryOptions);
  // Manage the first club the caller can administer.
  const club = clubs.data?.clubs.find((c) =>
    c.permissions.includes("settings.club")
  );

  if (!club) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("settings.club.forbidden")}</AlertDescription>
      </Alert>
    );
  }

  return <ClubRoles clubId={club.id} clubName={club.name} />;
}

function ClubRoles({ clubId, clubName }: { clubId: string; clubName: string }) {
  const { t } = useTranslation();
  const roles = useRoles(clubId);
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl">
          {t("settings.club.heading")}
        </h1>
        <p className="text-muted-foreground">{clubName}</p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-xl">{t("settings.club.roles")}</h2>
          <Button onClick={() => setCreating(true)}>
            {t("settings.club.newRole")}
          </Button>
        </div>

        {roles.isPending ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : roles.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{t("settings.club.loadError")}</AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-2">
            {roles.data.roles.map((role) => (
              <RoleRow
                key={role.id}
                clubId={clubId}
                role={role}
                onEdit={() => setEditing(role)}
              />
            ))}
          </div>
        )}
      </div>

      <InvitationsSection clubId={clubId} />

      {creating && (
        <RoleDialog clubId={clubId} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <RoleDialog
          clubId={clubId}
          role={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RoleRow({
  clubId,
  role,
  onEdit,
}: {
  clubId: string;
  role: Role;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const deleteRole = useDeleteRole(clubId);
  const isAdmin = role.systemKey === "admin";
  const isSystem = role.systemKey !== null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card p-3">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium">{role.name}</p>
          {isSystem && <Badge variant="secondary">{t("settings.club.system")}</Badge>}
          <p className="text-sm text-muted-foreground">
            {t("settings.club.memberCount", { count: role.memberCount })}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {role.permissions.length} {t("settings.club.permissionsCount")}
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onEdit} disabled={isAdmin}>
          {isAdmin ? t("settings.club.view") : t("common.edit")}
        </Button>
        {!isSystem && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={role.memberCount > 0 || deleteRole.isPending}
            onClick={() => deleteRole.mutate(role.id)}
          >
            {t("common.delete")}
          </Button>
        )}
      </div>
    </div>
  );
}

function RoleDialog({
  clubId,
  role,
  onClose,
}: {
  clubId: string;
  role?: Role;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createRole = useCreateRole(clubId);
  const updateRole = useUpdateRole(clubId);
  const readOnly = role?.systemKey === "admin";

  const form = useForm<RoleFormValues, unknown, RoleNameInput>({
    resolver: useZodResolver(roleFormSchema, "settings.club.validation"),
    defaultValues: { name: role?.name ?? "" },
  });
  const [permissions, setPermissions] = useState<Permission[]>(
    role?.permissions ?? []
  );

  const toggle = (permission: Permission) => {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission]
    );
  };

  const pending = createRole.isPending || updateRole.isPending;
  const error = createRole.isError || updateRole.isError;

  const handleSave = form.handleSubmit(async (data) => {
    if (role) {
      await updateRole.mutateAsync({
        roleId: role.id,
        name: data.name,
        permissions,
      });
    } else {
      await createRole.mutateAsync({ name: data.name, permissions });
    }
    onClose();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {role
              ? readOnly
                ? role.name
                : t("settings.club.editRole")
              : t("settings.club.newRole")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            id="role-form"
            className="flex flex-col gap-4"
            onSubmit={handleSave}
            noValidate
          >
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{t("settings.club.saveError")}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.club.roleName")}</FormLabel>
                  <FormControl>
                    <Input maxLength={50} disabled={readOnly} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-2">
              <p className="text-sm font-medium">
                {t("settings.club.permissions")}
              </p>
              <div className="grid gap-2">
                {PERMISSIONS.map((permission) => {
                  const id = `role-permission-${permission}`;
                  return (
                    <label
                      key={permission}
                      htmlFor={id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        id={id}
                        checked={permissions.includes(permission)}
                        onCheckedChange={() => toggle(permission)}
                        disabled={readOnly}
                      />
                      {t(`permissions.${permission}`)}
                    </label>
                  );
                })}
              </div>
            </div>
          </form>
        </Form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          {!readOnly && (
            <Button type="submit" form="role-form" disabled={pending}>
              {t("common.save")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
