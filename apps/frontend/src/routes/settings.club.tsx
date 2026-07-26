/**
 * Club settings — roles & permissions (issue #5).
 *
 * Only reachable with the settings.club permission in the selected club.
 * Lists the club's roles, allows creating/renaming custom roles and toggling
 * their permissions, and deleting unused custom roles. The Admin role is
 * shown read-only (it always holds every permission).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PERMISSIONS, type Permission, type Role } from "@fc-app/contracts";
import { InvitationsSection } from "@/components/InvitationsSection";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ensureMe } from "@/lib/auth";
import { ensureMyClubs, myClubsQueryOptions } from "@/lib/clubs";
import {
  useCreateRole,
  useDeleteRole,
  useRoles,
  useUpdateRole,
} from "@/lib/roles";

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
        <h1 className="text-3xl font-bold tracking-tight">
          {t("settings.club.heading")}
        </h1>
        <p className="text-muted-foreground">{clubName}</p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("settings.club.roles")}</h2>
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
    <Card className="py-4">
      <CardContent className="flex items-center justify-between px-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{role.name}</span>
            {isSystem && (
              <Badge variant="secondary">{t("settings.club.system")}</Badge>
            )}
            <span className="text-muted-foreground text-sm">
              {t("settings.club.memberCount", { count: role.memberCount })}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            {role.permissions.length} {t("settings.club.permissionsCount")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={isAdmin}
          >
            {isAdmin ? t("settings.club.view") : t("common.edit")}
          </Button>
          {!isSystem && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={role.memberCount > 0 || deleteRole.isPending}
              onClick={() => deleteRole.mutate(role.id)}
            >
              {t("common.delete")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
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

  const [name, setName] = useState(role?.name ?? "");
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
  const error = createRole.error ?? updateRole.error;

  const handleSave = async () => {
    if (role) {
      await updateRole.mutateAsync({ roleId: role.id, name, permissions });
    } else {
      await createRole.mutateAsync({ name, permissions });
    }
    onClose();
  };

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

        <div className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {t("settings.club.saveError")}
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="role-name">{t("settings.club.roleName")}</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={readOnly}
              maxLength={50}
            />
          </div>
          <p className="text-sm font-medium">
            {t("settings.club.permissions")}
          </p>
          <div className="flex flex-col gap-3">
            {PERMISSIONS.map((permission) => (
              <Label
                key={permission}
                htmlFor={`perm-${permission}`}
                className="gap-2 font-normal"
              >
                <Checkbox
                  id={`perm-${permission}`}
                  checked={permissions.includes(permission)}
                  onCheckedChange={() => toggle(permission)}
                  disabled={readOnly}
                />
                {t(`permissions.${permission}`)}
              </Label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          {!readOnly && (
            <Button
              onClick={handleSave}
              disabled={pending || name.trim().length === 0}
            >
              {t("common.save")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
