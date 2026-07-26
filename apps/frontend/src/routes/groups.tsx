/**
 * Groups page (issue #10) — custom, team-scoped member groups reusable for
 * roster filtering, call-up squad selection (#16), and post targeting (#18).
 *
 * Requires members.view; members.manage unlocks create/rename/delete and
 * managing membership.
 */
import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Group } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "@/lib/clubs";
import {
  useCreateGroup,
  useDeleteGroup,
  useGroupMembers,
  useGroups,
  useRenameGroup,
  useSetGroupMembers,
} from "@/lib/groups";
import { useMembers } from "@/lib/members";

export const Route = createFileRoute("/groups")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: GroupsPage,
});

function GroupsPage() {
  const { t } = useTranslation();
  const selected = useSelectedTeam();
  const canView = useHasPermission("members.view");

  if (!selected) {
    return (
      <Alert>
        <AlertDescription>{t("members.noTeam")}</AlertDescription>
      </Alert>
    );
  }
  if (!canView) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("groups.forbidden")}</AlertDescription>
      </Alert>
    );
  }

  return <GroupsList teamId={selected.team.id} teamName={selected.team.name} />;
}

function GroupsList({ teamId, teamName }: { teamId: string; teamName: string }) {
  const { t } = useTranslation();
  const canManage = useHasPermission("members.manage");
  const groups = useGroups(teamId);
  const renameGroup = useRenameGroup(teamId);
  const deleteGroup = useDeleteGroup(teamId);
  const [creating, setCreating] = useState(false);
  const [managingMembers, setManagingMembers] = useState<Group | null>(null);
  const [renaming, setRenaming] = useState<Group | null>(null);
  const [renameValue, setRenameValue] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("groups.heading")}
          </h1>
          <p className="text-muted-foreground">{teamName}</p>
        </div>
        {canManage && (
          <Button onClick={() => setCreating(true)}>{t("groups.new")}</Button>
        )}
      </div>

      {groups.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : groups.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("groups.loadError")}</AlertDescription>
        </Alert>
      ) : groups.data.groups.length === 0 ? (
        <p className="text-muted-foreground">{t("groups.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.data.groups.map((group) => (
            <Card key={group.id} className="py-4">
              <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4">
                <div>
                  <p className="font-medium">{group.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {t("groups.memberCount", { count: group.memberCount })}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setManagingMembers(group)}
                    >
                      {t("groups.manageMembers")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRenaming(group);
                        setRenameValue(group.name);
                      }}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={deleteGroup.isPending}
                      onClick={() => deleteGroup.mutate(group.id)}
                    >
                      {t("common.delete")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <CreateGroupDialog teamId={teamId} onClose={() => setCreating(false)} />
      )}

      {renaming && (
        <Dialog
          open
          onOpenChange={(open) => !open && setRenaming(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("groups.rename")}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              {renameGroup.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{t("groups.saveError")}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="group-rename">{t("groups.name")}</Label>
                <Input
                  id="group-rename"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  maxLength={100}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenaming(null)}
              >
                {t("common.close")}
              </Button>
              <Button
                disabled={renameValue.trim() === "" || renameGroup.isPending}
                onClick={async () => {
                  await renameGroup.mutateAsync({
                    groupId: renaming.id,
                    name: renameValue.trim(),
                  });
                  setRenaming(null);
                }}
              >
                {t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {managingMembers && (
        <ManageGroupMembersDialog
          teamId={teamId}
          group={managingMembers}
          onClose={() => setManagingMembers(null)}
        />
      )}
    </div>
  );
}

function CreateGroupDialog({
  teamId,
  onClose,
}: {
  teamId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const createGroup = useCreateGroup(teamId);
  const [name, setName] = useState("");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("groups.new")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {createGroup.isError && (
            <Alert variant="destructive">
              <AlertDescription>{t("groups.saveError")}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="group-name">{t("groups.name")}</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            disabled={name.trim() === "" || createGroup.isPending}
            onClick={async () => {
              await createGroup.mutateAsync(name.trim());
              onClose();
            }}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageGroupMembersDialog({
  teamId,
  group,
  onClose,
}: {
  teamId: string;
  group: Group;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const allMembers = useMembers(teamId, {});
  const groupMembers = useGroupMembers(teamId, group.id);
  const setGroupMembers = useSetGroupMembers(teamId, group.id);
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");

  const ready = allMembers.data && groupMembers.data;
  const currentIds = selectedIds ?? groupMembers.data?.memberIds ?? [];
  const options = allMembers.data?.members ?? [];

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query === "") return options;
    return options.filter((member) =>
      `${member.lastName}, ${member.firstName}`.toLowerCase().includes(query)
    );
  }, [options, search]);

  const toggle = (memberId: string) => {
    setSelectedIds((current) => {
      const base = current ?? groupMembers.data?.memberIds ?? [];
      return base.includes(memberId)
        ? base.filter((id) => id !== memberId)
        : [...base, memberId];
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("groups.membersOf", { name: group.name })}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          {setGroupMembers.isError && (
            <Alert variant="destructive">
              <AlertDescription>{t("groups.saveError")}</AlertDescription>
            </Alert>
          )}
          {!ready ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <>
              <Input
                placeholder={t("groups.members")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="max-h-72 overflow-y-auto rounded-md border">
                {filtered.length === 0 ? (
                  <p className="text-muted-foreground p-3 text-sm">
                    {t("members.empty")}
                  </p>
                ) : (
                  filtered.map((member) => {
                    const id = `group-member-${member.id}`;
                    return (
                      <Label
                        key={member.id}
                        htmlFor={id}
                        className="hover:bg-accent gap-2 border-b px-3 py-2 font-normal last:border-0"
                      >
                        <Checkbox
                          id={id}
                          checked={currentIds.includes(member.id)}
                          onCheckedChange={() => toggle(member.id)}
                        />
                        {member.lastName}, {member.firstName}
                      </Label>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            disabled={!ready || setGroupMembers.isPending}
            onClick={async () => {
              await setGroupMembers.mutateAsync(currentIds);
              onClose();
            }}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
