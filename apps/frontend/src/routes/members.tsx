/** Members roster (issue #7) — the team's list of members. */
import { Fragment, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Member, MemberFieldDefinition } from "@fc-app/contracts";
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
import { cn } from "@/lib/utils";
import { formatFieldValue } from "../components/memberFieldDisplay";
import { MemberFieldCell } from "../components/MemberFieldCell";
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
import {
  useMemberFields,
  useSetMemberFieldValues,
} from "../lib/member-fields";
import {
  filledCount,
  readPickedFieldIds,
  visibleFields,
  writePickedFieldIds,
} from "../lib/member-field-view";
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
  // Fill-in mode is per-visit too: it is turned on when there is something to
  // fill in. Which *fields* it shows is remembered — see below.
  const [fillFields, setFillFields] = useState(false);
  const [creating, setCreating] = useState(false);

  // The picked field ids, per team. Null means nothing has ever been chosen,
  // which `visibleFields` answers with every field.
  const [pickedIds, setPickedIds] = useState<string[] | null>(() =>
    readPickedFieldIds(teamId)
  );
  // Switching team keeps this component mounted, and two teams' field sets
  // have nothing to do with each other — so the stored choice is re-read
  // rather than carried across.
  const [pickedFor, setPickedFor] = useState(teamId);
  if (pickedFor !== teamId) {
    setPickedFor(teamId);
    setPickedIds(readPickedFieldIds(teamId));
  }

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

  // Filling in is writing, so it needs `members.manage` — the same permission
  // `setMemberFieldValues` checks. There is no read-only fill-in mode; the
  // read-only view of these values is the roster itself. And a team with no
  // custom fields sees no switch, mirroring the grouping one.
  const canFill = canManage && customColumns.length > 0;
  const fillMode = canFill && fillFields;
  const pickedFields = visibleFields(pickedIds, customColumns);

  const togglePicked = (fieldId: string): void => {
    const current = pickedFields.map((field) => field.id);
    const next = current.includes(fieldId)
      ? current.filter((id) => id !== fieldId)
      : [...current, fieldId];
    setPickedIds(next);
    writePickedFieldIds(teamId, next);
  };

  // A team with no groups sees no grouping at all, mirroring the filter. And
  // when the filter already names one group, a single heading repeating that
  // label above the list says nothing — so that renders flat.
  //
  // On a phone in fill-in mode the cards are already keyed by field, so a
  // second level of headings inside them would be noise: the switch goes away
  // and the group filter is how you narrow to A-truppen.
  const canGroup = teamGroups.length > 0 && groupId === "";
  const groupingOffered = canGroup && !(isPhone && fillMode);
  const sections: MemberSection[] | null =
    groupingOffered && groupByGroup && members.data
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
        {canFill && (
          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="fill-fields"
              checked={fillFields}
              onCheckedChange={setFillFields}
            />
            <Label htmlFor="fill-fields">{t("members.fillFields")}</Label>
          </div>
        )}
        {groupingOffered && (
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

      {fillMode && (
        <FieldPicker
          fields={customColumns}
          picked={pickedFields}
          onToggle={togglePicked}
        />
      )}

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
      ) : fillMode ? (
        pickedFields.length === 0 ? (
          // Unpicking everything is allowed; it says so rather than showing an
          // empty screen, and nothing is silently re-picked.
          <p className="text-muted-foreground">{t("members.noFieldsPicked")}</p>
        ) : (
          <FillIn
            compact={isPhone}
            teamId={teamId}
            fields={pickedFields}
            members={members.data.members}
            sections={isPhone ? null : sections}
          />
        )
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
 * Which of the team's fields the fill-in view shows.
 *
 * Chips rather than a dropdown or a sheet: it needs no overlay primitive the
 * repo does not have, it behaves the same in both shells, and — the real
 * argument — it keeps the current selection visible while you work instead of
 * hidden behind a control you have to open to check.
 */
function FieldPicker({
  fields,
  picked,
  onToggle,
}: {
  fields: MemberFieldDefinition[];
  picked: MemberFieldDefinition[];
  onToggle: (fieldId: string) => void;
}) {
  const { t } = useTranslation();
  const pickedIds = new Set(picked.map((field) => field.id));

  return (
    <div
      role="group"
      aria-label={t("members.chooseFields")}
      className="flex flex-wrap gap-2"
    >
      {fields.map((field) => {
        const on = pickedIds.has(field.id);
        return (
          <Button
            key={field.id}
            type="button"
            size="sm"
            variant={on ? "default" : "outline"}
            aria-pressed={on}
            onClick={() => onToggle(field.id)}
          >
            {field.name}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * The roster turned into somewhere to fill the team's custom fields in (#103).
 *
 * A coach does this standing on the pitch, on a phone: one field swept across
 * the whole squad — shirt sizes, fee paid, kit handed out — not one member
 * visited at a time. The alternative today is the spreadsheet this app exists
 * to replace.
 */
function FillIn({
  compact,
  teamId,
  fields,
  members,
  sections,
}: {
  /** Phone shape: a card per field instead of a members × fields grid. */
  compact: boolean;
  teamId: string;
  fields: MemberFieldDefinition[];
  members: Member[];
  /** Desktop only — rows stay member-major there, so #99's sections apply. */
  sections: MemberSection[] | null;
}) {
  const { t } = useTranslation();
  const setValues = useSetMemberFieldValues(teamId);

  const cellFor = (member: Member, field: MemberFieldDefinition) => (
    <MemberFieldCell
      field={field}
      memberId={member.id}
      memberName={formatMemberName(member)}
      saved={member.customFields[field.id] ?? ""}
      // `mutateAsync`, so each cell owns whether *its* save is in flight or
      // refused. The mutation itself only remembers the latest call, which in
      // a sweep is the wrong cell by the time an answer comes back.
      onSave={(value) =>
        // A partial record: `setMemberFieldValues` only touches the keys it is
        // given, so one field for one member leaves the rest alone.
        setValues.mutateAsync({
          memberId: member.id,
          values: { [field.id]: value },
        })
      }
    />
  );

  /**
   * The phone turns the list on its side — a card per field, the squad as rows
   * inside it. Same shape as `/tracking` (#19) and for the same reason: a
   * members × fields grid does not survive 390px, and a list behind a
   * horizontal scroll is a list a thumb has to discover. It is also the shape
   * the task itself has — one field, twenty-three people.
   */
  if (compact) {
    return (
      <div className="flex flex-col gap-[14px]">
        {fields.map((field) => {
          const progress = filledCount(field.id, members);
          return (
            <div
              key={field.id}
              className="bg-card flex flex-col gap-1 rounded-xl px-4 py-[18px]"
            >
              <div className="flex items-baseline justify-between gap-3 px-1">
                <span className="font-semibold">
                  {field.required ? `${field.name} *` : field.name}
                </span>
                {/* Seeing what is still missing is the point of opening this.
                    The denominator is the rows on screen, after the search and
                    the group filter — never the team's total. */}
                <span className="text-muted-foreground text-xs font-semibold tabular-nums">
                  {progress.done}/{progress.total}
                </span>
              </div>
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex min-h-tap-row items-center justify-between gap-3 px-1"
                >
                  {/* Text, not a link. In the normal roster a row navigates to
                      the member; here a stray tap that leaves the page mid
                      sweep loses the sweep. The member page is one switch
                      away. */}
                  <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm font-semibold">
                    <span className="truncate">{formatMemberName(member)}</span>
                    {member.archived && (
                      <Badge variant="secondary" className="flex-none">
                        {t("members.archived")}
                      </Badge>
                    )}
                  </span>
                  <span className="flex-none">{cellFor(member, field)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  const tableSections: MemberSection[] = sections ?? [
    { groupId: null, name: "", members },
  ];

  return (
    <div className="bg-card overflow-x-auto rounded-xl">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {/* DDR-009: this table is now unbounded in width, so the column
                that says who a row is stays put while the rest scrolls. */}
            <th
              scope="col"
              className="bg-card sticky left-0 z-10 px-4 py-3 text-left align-bottom"
            >
              <span className="kit-overline">{t("members.name")}</span>
            </th>
            {fields.map((field) => {
              const progress = filledCount(field.id, members);
              return (
                <th
                  key={field.id}
                  scope="col"
                  className="min-w-[148px] px-3 py-3 text-left align-bottom"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="font-semibold">
                      {field.required ? `${field.name} *` : field.name}
                    </span>
                    <span className="text-muted-foreground text-xs font-semibold tabular-nums">
                      {progress.done}/{progress.total}
                    </span>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {tableSections.map((section) => (
            <Fragment key={section.groupId ?? "ungrouped"}>
              {sections !== null && (
                <tr>
                  {/* The span tracks the *picked* fields, not the team's whole
                      field list, or the layout breaks the moment one is
                      unpicked. The count is the rows drawn. */}
                  <td
                    colSpan={1 + fields.length}
                    className="kit-overline text-muted-foreground px-4 pt-6 pb-1"
                  >
                    {section.name} ({section.members.length})
                  </td>
                </tr>
              )}
              {section.members.map((member, index) => (
                <tr
                  key={member.id}
                  // Kit separates with colour, not rules: alternate rows carry
                  // a faint tint so a long row stays readable across columns.
                  className={cn(index % 2 === 1 && "bg-[var(--neutral-050)]")}
                >
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 z-10 px-4 py-2 text-left font-semibold whitespace-nowrap",
                      index % 2 === 1 ? "bg-[var(--neutral-050)]" : "bg-card",
                    )}
                  >
                    <Link
                      to="/members/$memberId"
                      params={{ memberId: member.id }}
                      className="hover:underline"
                    >
                      {formatMemberName(member)}
                    </Link>
                    {member.archived && (
                      <Badge variant="secondary" className="ml-2">
                        {t("members.archived")}
                      </Badge>
                    )}
                  </th>
                  {fields.map((field) => (
                    <td key={field.id} className="px-3 py-2 align-top">
                      {cellFor(member, field)}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
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
