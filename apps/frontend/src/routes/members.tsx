/** Members roster (issue #7) — the team's list of members. */
import { Fragment, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Member } from "@fc-app/contracts";
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
import { SEPARATOR } from "../lib/dates";
import { useIsPhone } from "../lib/breakpoint";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import {
  useInviteMemberContacts,
  usePendingContactInvites,
} from "../lib/guardians";
import { useGroups } from "../lib/groups";
import { groupMembers, type MemberSection } from "../lib/member-grouping";
import { useMemberFields } from "../lib/member-fields";
import {
  formatMemberName,
  useCreateMember,
  useMembers,
} from "../lib/members";

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
  const isPhone = useIsPhone();
  const canManage = useHasPermission("members.manage");
  const canImport = useHasPermission("members.import");
  // Inviting anyone into the club is an admin's call, however narrow the
  // invitation is.
  const canInvite = useHasPermission("settings.club");
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [groupId, setGroupId] = useState("");
  // A per-visit view toggle, and grouped is the point — so `useState`, not
  // storage. `lib/clubs.ts` has the localStorage pattern if that turns out
  // to be wrong.
  const [groupByGroup, setGroupByGroup] = useState(true);
  const [creating, setCreating] = useState(false);

  const members = useMembers(teamId, {
    search,
    includeArchived,
    ...(groupId ? { groupId } : {}),
  });
  const fields = useMemberFields(teamId);
  const groups = useGroups(teamId);
  const createMember = useCreateMember(teamId);
  const pendingInvites = usePendingContactInvites(teamId, canInvite);
  const inviteContacts = useInviteMemberContacts(teamId);
  const customColumns = fields.data?.fields ?? [];
  const teamGroups = groups.data?.groups ?? [];
  // A team with no groups sees no grouping at all, mirroring the filter. And
  // when the filter already names one group, a single heading repeating that
  // label above the list says nothing — so that renders flat.
  const canGroup = teamGroups.length > 0 && groupId === "";
  const sections: MemberSection[] | null =
    canGroup && groupByGroup && members.data
      ? groupMembers(
          members.data.members,
          members.data.groupIds,
          teamGroups,
          t("members.ungrouped")
        )
      : null;
  /** One nameless section when grouping is off, so the table has one shape. */
  const tableSections: MemberSection[] = sections ?? [
    { groupId: null, name: "", members: members.data?.members ?? [] },
  ];

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

      {/* Only worth a line when there is actually someone out of reach. */}
      {canInvite && (pendingInvites.data?.invitable ?? 0) > 0 && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {t("guardians.pendingInvites", {
                count: pendingInvites.data?.invitable ?? 0,
              })}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={inviteContacts.isPending}
              onClick={() => inviteContacts.mutate()}
            >
              {t("guardians.inviteAll")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {inviteContacts.data && (
        <Alert>
          <AlertDescription>
            {t("guardians.invitesSent", { count: inviteContacts.data.invited })}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex w-full flex-col gap-1.5 kit:w-auto">
          <Label htmlFor="member-search">{t("members.search")}</Label>
          <Input
            id="member-search"
            className="w-full kit:w-56"
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
        {canGroup && (
          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="group-by-group"
              checked={groupByGroup}
              onCheckedChange={setGroupByGroup}
            />
            <Label htmlFor="group-by-group">{t("members.groupByGroup")}</Label>
          </div>
        )}
        {(groups.data?.groups.length ?? 0) > 0 && (
          <div className="flex flex-1 flex-col gap-1.5 kit:flex-none">
            <Label htmlFor="group-filter">{t("groups.filterLabel")}</Label>
            <Select
              value={groupId === "" ? ALL_GROUPS : groupId}
              onValueChange={(value) =>
                setGroupId(value === ALL_GROUPS ? "" : value)
              }
            >
              <SelectTrigger id="group-filter" size="sm" className="w-full kit:w-40">
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
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground">{t("members.empty")}</p>
          {/* The case the import exists for: a team on its first day. */}
          {canImport && (
            <Button variant="outline" asChild>
              <Link to="/import">{t("import.fromEmptyRoster")}</Link>
            </Button>
          )}
        </div>
      ) : isPhone ? (
        /* Kit's adapt matrix calls a table a swap, not an adjust: the pill nav
           and the column set do not survive 390px. A member becomes a row —
           initials, name, and one short meta line. The custom-field columns do
           not come along; they are one tap away on the member, and inventing a
           horizontal scroll for an unbounded number of them would be the
           clipping Kit forbids. */
        <div className="flex flex-col gap-[11px]">
          {sections === null
            ? members.data.members.map((member) => (
                <MemberRow key={member.id} member={member} />
              ))
            : sections.map((section) => (
                <div
                  key={section.groupId ?? "ungrouped"}
                  className="flex flex-col gap-[11px]"
                >
                  {/* The count is the rows drawn, never `group.memberCount`
                      — a member in two groups is drawn once. */}
                  <p className="kit-overline text-muted-foreground mt-2">
                    {section.name} ({section.members.length})
                  </p>
                  {section.members.map((member) => (
                    <MemberRow key={member.id} member={member} />
                  ))}
                </div>
              ))}
        </div>
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
              {tableSections.map((section) => (
                <Fragment key={section.groupId ?? "ungrouped"}>
                  {sections !== null && (
                    <TableRow className="hover:bg-transparent">
                      {/* The span has to track the custom columns, or the
                          layout breaks the moment a team defines a field.
                          The count is the rows drawn, never
                          `group.memberCount`. */}
                      <TableCell
                        colSpan={3 + customColumns.length}
                        className="kit-overline text-muted-foreground pt-6"
                      >
                        {section.name} ({section.members.length})
                      </TableCell>
                    </TableRow>
                  )}
                  {section.members.map((member) => (
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
                    {formatMemberName(member)}
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
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {creating && (
        <MemberFormDialog
          saving={createMember.isPending}
          error={createMember.error}
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

/**
 * A member on a phone (Kit's `PlayerRow`, adjusted): initials, name, and one
 * short meta line. Kit's rule for this row on mobile is that the right-hand
 * column drops and the meta shortens — so the birth year and the one contact
 * detail share a line, joined by the house separator, and the archived state
 * is carried by a badge rather than a column of its own.
 */
function MemberRow({ member }: { member: Member }) {
  const { t } = useTranslation();
  const initials =
    `${member.firstName.charAt(0)}${member.lastName.charAt(0)}`.toUpperCase();
  const meta = [member.birthYear, member.email ?? member.phone]
    .filter((part) => part !== null && part !== "")
    .join(SEPARATOR);

  return (
    <Link
      to="/members/$memberId"
      params={{ memberId: member.id }}
      className="bg-card hover:bg-secondary flex min-h-tap-row items-center gap-3 rounded-lg px-4 py-3 transition-colors duration-[120ms] ease-standard"
    >
      <span
        aria-hidden
        className="bg-secondary text-muted-foreground flex size-10 flex-none items-center justify-center rounded-full text-sm font-bold"
      >
        {initials}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">
          {formatMemberName(member)}
        </span>
        {meta !== "" && (
          <span className="text-muted-foreground truncate text-sm">{meta}</span>
        )}
      </span>
      {member.archived && (
        <Badge variant="secondary" className="flex-none">
          {t("members.archived")}
        </Badge>
      )}
    </Link>
  );
}
