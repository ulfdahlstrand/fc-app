/**
 * Groups page (issue #10) — custom, team-scoped member groups reusable for
 * roster filtering, call-up squad selection (#16), and post targeting (#18).
 *
 * Requires members.view; members.manage unlocks create/rename/delete and
 * managing membership.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Group } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import { useZodResolver } from "../lib/form";
import {
  groupFormSchema,
  useCreateGroup,
  useDeleteGroup,
  useGroupMembers,
  useGroups,
  useRenameGroup,
  useSetGroupMembers,
  type GroupFormValues,
  type GroupNameInput,
} from "../lib/groups";
import { useMembers } from "../lib/members";

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
  const deleteGroup = useDeleteGroup(teamId);
  const [creating, setCreating] = useState(false);
  const [managingMembers, setManagingMembers] = useState<Group | null>(null);
  const [renaming, setRenaming] = useState<Group | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-4xl">
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
            <div
              key={group.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card p-3"
            >
              <div>
                <p className="font-medium">{group.name}</p>
                <p className="text-sm text-muted-foreground">
                  {t("groups.memberCount", { count: group.memberCount })}
                </p>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setManagingMembers(group)}
                  >
                    {t("groups.manageMembers")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRenaming(group)}
                  >
                    {t("common.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={deleteGroup.isPending}
                    onClick={() => deleteGroup.mutate(group.id)}
                  >
                    {t("common.delete")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateGroupDialog teamId={teamId} onClose={() => setCreating(false)} />
      )}

      {renaming && (
        <RenameGroupDialog
          teamId={teamId}
          group={renaming}
          onClose={() => setRenaming(null)}
        />
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
  const form = useForm<GroupFormValues, unknown, GroupNameInput>({
    resolver: useZodResolver(groupFormSchema, "groups.validation"),
    defaultValues: { name: "" },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("groups.new")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            id="create-group-form"
            className="grid gap-4"
            onSubmit={form.handleSubmit(async (input) => {
              await createGroup.mutateAsync(input.name);
              onClose();
            })}
            noValidate
          >
            {createGroup.isError && (
              <Alert variant="destructive">
                <AlertDescription>{t("groups.saveError")}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("groups.name")}</FormLabel>
                  <FormControl>
                    <Input maxLength={100} {...field} />
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
          <Button
            type="submit"
            form="create-group-form"
            disabled={createGroup.isPending}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameGroupDialog({
  teamId,
  group,
  onClose,
}: {
  teamId: string;
  group: Group;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const renameGroup = useRenameGroup(teamId);
  const form = useForm<GroupFormValues, unknown, GroupNameInput>({
    resolver: useZodResolver(groupFormSchema, "groups.validation"),
    defaultValues: { name: group.name },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("groups.rename")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            id="rename-group-form"
            className="grid gap-4"
            onSubmit={form.handleSubmit(async (input) => {
              await renameGroup.mutateAsync({
                groupId: group.id,
                name: input.name,
              });
              onClose();
            })}
            noValidate
          >
            {renameGroup.isError && (
              <Alert variant="destructive">
                <AlertDescription>{t("groups.saveError")}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("groups.name")}</FormLabel>
                  <FormControl>
                    <Input maxLength={100} {...field} />
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
          <Button
            type="submit"
            form="rename-group-form"
            disabled={renameGroup.isPending}
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

  const ready = allMembers.data && groupMembers.data;
  const currentIds = selectedIds ?? groupMembers.data?.memberIds ?? [];
  const options = allMembers.data?.members ?? [];

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
          <DialogTitle>{t("groups.membersOf", { name: group.name })}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {setGroupMembers.isError && (
            <Alert variant="destructive">
              <AlertDescription>{t("groups.saveError")}</AlertDescription>
            </Alert>
          )}
          {!ready ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-md bg-card p-3">
              {options.map((member) => {
                const id = `group-member-${member.id}`;
                return (
                  <label
                    key={member.id}
                    htmlFor={id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      id={id}
                      checked={currentIds.includes(member.id)}
                      onCheckedChange={() => toggle(member.id)}
                    />
                    {member.lastName}, {member.firstName}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            type="button"
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
