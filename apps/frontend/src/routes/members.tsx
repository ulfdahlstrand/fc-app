/**
 * Members roster (issue #7) — the team's list of members.
 *
 * Requires members.view in the selected team. Supports search and an
 * archived filter; members.manage unlocks adding members. Rows link to the
 * detail page.
 */
import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatFieldValue } from "../components/memberFieldDisplay";
import { MemberFormDialog } from "../components/MemberFormDialog";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import { useGroups } from "../lib/groups";
import { useMemberFields } from "../lib/member-fields";
import { useCreateMember, useMembers } from "../lib/members";

/** Sentinel select value for "all groups" — Radix disallows an empty-string item value. */
const ALL_GROUPS = "__all__";

export const Route = createFileRoute("/members")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: MembersPage,
});

function MembersPage() {
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
        <AlertDescription>{t("members.forbidden")}</AlertDescription>
      </Alert>
    );
  }

  return <Roster teamId={selected.team.id} teamName={selected.team.name} />;
}

function Roster({ teamId, teamName }: { teamId: string; teamName: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canManage = useHasPermission("members.manage");
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [creating, setCreating] = useState(false);

  const members = useMembers(teamId, {
    search,
    includeArchived,
    ...(groupId ? { groupId } : {}),
  });
  const fields = useMemberFields(teamId);
  const groups = useGroups(teamId);
  const createMember = useCreateMember(teamId);
  const customColumns = fields.data?.fields ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-4xl">
            {t("members.heading")}
          </h1>
          <p className="text-muted-foreground">{teamName}</p>
        </div>
        {canManage && (
          <Button onClick={() => setCreating(true)}>{t("members.add")}</Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="member-search">{t("members.search")}</Label>
          <Input
            id="member-search"
            className="w-56"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch
            id="show-archived"
            checked={includeArchived}
            onCheckedChange={setIncludeArchived}
          />
          <Label htmlFor="show-archived">{t("members.showArchived")}</Label>
        </div>
        {(groups.data?.groups.length ?? 0) > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-filter">{t("groups.filterLabel")}</Label>
            <Select
              value={groupId === "" ? ALL_GROUPS : groupId}
              onValueChange={(value) =>
                setGroupId(value === ALL_GROUPS ? "" : value)
              }
            >
              <SelectTrigger id="group-filter" size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_GROUPS}>
                  {t("groups.allMembers")}
                </SelectItem>
                {groups.data?.groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {members.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : members.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("members.loadError")}</AlertDescription>
        </Alert>
      ) : members.data.members.length === 0 ? (
        <p className="text-muted-foreground">{t("members.empty")}</p>
      ) : (
        <div className="rounded-xl bg-card px-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("members.name")}</TableHead>
                <TableHead>{t("members.birthYear")}</TableHead>
                <TableHead>{t("members.contact")}</TableHead>
                {customColumns.map((field) => (
                  <TableHead key={field.id}>{field.name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.members.map((member) => (
                <TableRow
                  key={member.id}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate({
                      to: "/members/$memberId",
                      params: { memberId: member.id },
                    })
                  }
                >
                  <TableCell>
                    {member.lastName}, {member.firstName}
                    {member.archived && (
                      <Badge variant="secondary" className="ml-2">
                        {t("members.archived")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{member.birthYear ?? "—"}</TableCell>
                  <TableCell>{member.email ?? member.phone ?? "—"}</TableCell>
                  {customColumns.map((field) => (
                    <TableCell key={field.id}>
                      {formatFieldValue(field, member.customFields[field.id], t)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {creating && (
        <MemberFormDialog
          saving={createMember.isPending}
          error={createMember.isError}
          onSave={async (input) => {
            await createMember.mutateAsync(input);
            setCreating(false);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
