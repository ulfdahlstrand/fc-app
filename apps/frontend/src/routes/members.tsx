/**
 * Members roster (issue #7) — the team's list of members.
 *
 * Three views under one filter bar, held in `?view=`: the list, the squad's
 * latest assessments, and filling in the custom fields. The search, archived
 * and group filters apply to all three.
 *
 * The menu between them is team settings' `SectionNav`, working the same way:
 * a column beside the view on the desktop, and on the phone the menu as a
 * screen of its own with the view as the page after it.
 */
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
import { MemberDevelopmentOverview } from "@/components/MemberDevelopmentOverview";
import {
  SectionBackLink,
  SectionColumns,
  SectionNav,
} from "@/components/SectionNav";
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
import { MemberFieldValue } from "../components/MemberFieldValue";
import { ensureMe } from "../lib/auth";
import { SEPARATOR, toDateInput } from "../lib/dates";
import { useIsPhone } from "../lib/breakpoint";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import { useGroups } from "../lib/groups";
import { groupMembers, type MemberSection } from "../lib/member-grouping";
import {
  useMemberFields,
  useSetMemberFieldValues,
} from "../lib/member-fields";
import {
  filledCount,
  presentationCircle,
  readPickedFieldIds,
  fieldLabel,
  rosterColumns,
  visibleFields,
  writePickedFieldIds,
} from "../lib/member-field-view";
import { formatMemberName, useMembers } from "../lib/members";

/** Sentinel select value for "all groups" — Radix disallows an empty-string item value. */
const ALL_GROUPS = "__all__";

/**
 * The width of the fill-in table's leading column, in px, so the name column
 * can be offset by exactly that much and the two stay pinned side by side
 * (DDR-009). It matches the `min-w-[148px]` the other columns carry — an
 * editable cell has a floor of its own (`MemberFieldCell`), and measuring at
 * runtime to save a few pixels would buy a layout effect for nothing.
 */
const LEAD_COLUMN = 148;

type MembersView = "list" | "development" | "fill";

const MEMBERS_VIEWS: readonly MembersView[] = ["list", "development", "fill"];

export interface MembersSearch {
  view?: MembersView;
}

export const Route = createFileRoute("/members")({
  staticData: { layout: "wide" },
  validateSearch: (search: Record<string, unknown>): MembersSearch => {
    const view = MEMBERS_VIEWS.find((candidate) => candidate === search["view"]);
    return view ? { view } : {};
  },
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
  const canSeeDevelopment = useHasPermission("development.manage");
  const { view: requestedView } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [groupId, setGroupId] = useState("");

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
  // Only the fields the team put in the list; the rest live on the member's
  // own page, and the user's pick below chooses among these. The presentation
  // field is held apart because it does not sit among the columns at all — it
  // goes in front of the name (#8 follow-up).
  // A field tied to a season that has ended is gone from the roster too
  // (`listFields`); "today" is the viewer's local date.
  const { presentation, rest: customColumns } = rosterColumns(
    fields.data?.fields ?? [],
    toDateInput(new Date())
  );
  const teamGroups = groups.data?.groups ?? [];

  // Filling in is writing, so it needs `members.manage` — the same permission
  // `setMemberFieldValues` checks. There is no read-only fill-in mode; the
  // read-only view of these values is the roster itself. And a team with no
  // custom fields has nothing to fill in, so it gets no such view.
  const canFill =
    canManage && (presentation !== null || customColumns.length > 0);
  const views: MembersView[] = [
    "list",
    ...(canSeeDevelopment ? (["development"] as const) : []),
    ...(canFill ? (["fill"] as const) : []),
  ];
  // One view has nothing to choose between, so there is no menu at all.
  const hasMenu = views.length > 1;
  // A view this user may not open — a shared link, a permission since taken
  // away — counts as none named. With none named the desktop opens the list
  // rather than an empty column; the phone stays on the menu, which is a
  // screen of its own. Same rule as team settings.
  const requested =
    requestedView !== undefined && views.includes(requestedView)
      ? requestedView
      : null;
  const view: MembersView | null =
    requested ?? (isPhone && hasMenu ? null : "list");
  const fillMode = view === "fill";
  const pickedFields = visibleFields(pickedIds, customColumns);

  const togglePicked = (fieldId: string): void => {
    const current = pickedFields.map((field) => field.id);
    const next = current.includes(fieldId)
      ? current.filter((id) => id !== fieldId)
      : [...current, fieldId];
    setPickedIds(next);
    writePickedFieldIds(teamId, next);
  };

  // Grouped is the point, so it is always on — there is no switch. A team
  // with no groups has nothing to group by, and when the filter already names
  // one group, a single heading repeating that label says nothing — so those
  // render flat.
  //
  // On a phone in fill-in mode the cards are already keyed by field, so a
  // second level of headings inside them would be noise: the group filter is
  // how you narrow to A-truppen there.
  const canGroup = teamGroups.length > 0 && groupId === "";
  const grouped = canGroup && !(isPhone && fillMode);
  const sections: MemberSection[] | null =
    grouped && members.data
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

  const navItems = views.map((item) => ({
    id: item,
    label: t(`members.views.${item}`),
    link: { to: "/members", search: { view: item } } as const,
  }));
  const navLabel = t("members.views.label");

  // The page is a list. Adding a member by hand and inviting the guardians an
  // import brought in are both administration, and both now live in team
  // settings — off a page that is opened to read.
  const heading = (
    <div>
      <h1 className="font-display text-4xl">{t("members.heading")}</h1>
      <p className="text-muted-foreground">{teamName}</p>
    </div>
  );

  // The phone's menu is a screen of its own, as in team settings.
  if (view === null) {
    return (
      <div className="flex flex-col gap-6">
        {heading}
        <SectionNav
          label={navLabel}
          items={navItems}
          activeId={null}
          variant="list"
        />
      </div>
    );
  }

  const sideMenu = hasMenu && !isPhone;

  return (
    <div className="flex flex-col gap-6 kit:gap-8">
      {hasMenu && isPhone ? (
        // The back link replaces the heading, and the view's own name says
        // where you are — two titles in a row would say it twice.
        <div className="flex flex-col gap-2">
          <SectionBackLink link={{ to: "/members" }} label={t("members.heading")} />
          <h1 className="font-display text-4xl">
            {t(`members.views.${view}`)}
          </h1>
        </div>
      ) : null}
      <SectionColumns
        heading={hasMenu && isPhone ? null : heading}
        nav={
          sideMenu ? (
            <SectionNav
              label={navLabel}
              items={navItems}
              activeId={view}
              variant="column"
            />
          ) : null
        }
      >
        <div className="flex min-w-0 flex-col gap-6">
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
              {/* The case the import exists for: a team on its first day. The
                  other way in is one member at a time, and this is where someone
                  looks for it — so the empty roster says where it moved to. */}
              {canImport && (
                <Button variant="outline" asChild>
                  <Link to="/import">{t("import.fromEmptyRoster")}</Link>
                </Button>
              )}
              {canManage && (
                <Button variant="outline" asChild>
                  <Link to="/settings/team" search={{ section: "members" }}>
                    {t("members.addInSettings")}
                  </Link>
                </Button>
              )}
            </div>
          ) : view === "development" ? (
            <MemberDevelopmentOverview
              compact={isPhone}
              teamId={teamId}
              members={members.data.members}
              sections={sections}
            />
          ) : fillMode ? (
            pickedFields.length === 0 ? (
              // Unpicking everything is allowed; it says so rather than showing an
              // empty screen, and nothing is silently re-picked.
              <p className="text-muted-foreground">{t("members.noFieldsPicked")}</p>
            ) : (
              <FillIn
                compact={isPhone}
                teamId={teamId}
                presentation={presentation}
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
                    <MemberRow
                      key={member.id}
                      member={member}
                      presentation={presentation}
                    />
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
                        <MemberRow
                          key={member.id}
                          member={member}
                          presentation={presentation}
                        />
                      ))}
                    </div>
                  ))}
            </div>
          ) : (
            <div className="rounded-xl bg-card px-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Before the name, not among the columns: the team said this
                        field helps say who a row is. */}
                    {presentation && <TableHead>{fieldLabel(presentation)}</TableHead>}
                    <TableHead>{t("members.name")}</TableHead>
                    <TableHead>{t("members.birthYear")}</TableHead>
                    <TableHead>{t("members.contact")}</TableHead>
                    {customColumns.map((field) => (
                      <TableHead key={field.id}>{fieldLabel(field)}</TableHead>
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
                            colSpan={
                              3 + customColumns.length + (presentation ? 1 : 0)
                            }
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
                      {presentation && (
                        <TableCell className="font-semibold tabular-nums">
                          {formatFieldValue(
                            presentation,
                            member.customFields[presentation.id],
                            t
                          )}
                        </TableCell>
                      )}
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
                          <MemberFieldValue
                            field={field}
                            raw={member.customFields[field.id]}
                          />
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
        </div>
      </SectionColumns>
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
            {fieldLabel(field)}
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
  presentation,
  fields,
  members,
  sections,
}: {
  /** Phone shape: a card per field instead of a members × fields grid. */
  compact: boolean;
  teamId: string;
  /**
   * The team's leading field, if it has one. Not in `fields` and not in the
   * picker: it is always here, because it is what says which row you are on —
   * and it is filled in from here like any other.
   */
  presentation: MemberFieldDefinition | null;
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
        {(presentation ? [presentation, ...fields] : fields).map((field) => {
          const progress = filledCount(field.id, members);
          return (
            <div
              key={field.id}
              className="bg-card flex flex-col gap-1 rounded-xl px-4 py-[18px]"
            >
              <div className="flex items-baseline justify-between gap-3 px-1">
                <span className="font-semibold">
                  {field.required ? `${fieldLabel(field)} *` : fieldLabel(field)}
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
            {/* DDR-009: this table is now unbounded in width, so what says who
                a row is stays put while the rest scrolls. That is the name and,
                when the team has one, the presentation field in front of it —
                two sticky columns, so the second is offset by the first's
                width. Fixed rather than measured: the cell holds one short
                value and the input inside it has a floor of its own. */}
            {presentation && (
              <th
                scope="col"
                style={{ left: 0, width: LEAD_COLUMN }}
                className="bg-card sticky z-10 px-3 py-3 text-left align-bottom"
              >
                <FillHeading field={presentation} members={members} />
              </th>
            )}
            <th
              scope="col"
              style={{ left: presentation ? LEAD_COLUMN : 0 }}
              className="bg-card sticky z-10 px-4 py-3 text-left align-bottom"
            >
              <span className="kit-overline">{t("members.name")}</span>
            </th>
            {fields.map((field) => (
              <th
                key={field.id}
                scope="col"
                className="min-w-[148px] px-3 py-3 text-left align-bottom"
              >
                <FillHeading field={field} members={members} />
              </th>
            ))}
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
                    colSpan={1 + fields.length + (presentation ? 1 : 0)}
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
                  {presentation && (
                    <td
                      style={{ left: 0, width: LEAD_COLUMN }}
                      className={cn(
                        "sticky z-10 px-3 py-2 align-top",
                        index % 2 === 1 ? "bg-[var(--neutral-050)]" : "bg-card",
                      )}
                    >
                      {cellFor(member, presentation)}
                    </td>
                  )}
                  <th
                    scope="row"
                    style={{ left: presentation ? LEAD_COLUMN : 0 }}
                    className={cn(
                      "sticky z-10 px-4 py-2 text-left font-semibold whitespace-nowrap",
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

/** A fill-in column's heading: what the field is, and how much of it is done. */
function FillHeading({
  field,
  members,
}: {
  field: MemberFieldDefinition;
  members: Member[];
}) {
  // Seeing what is still missing is the point of opening this. The denominator
  // is the rows on screen, after the search and the group filter — never the
  // team's total.
  const progress = filledCount(field.id, members);
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-semibold">
        {field.required ? `${fieldLabel(field)} *` : fieldLabel(field)}
      </span>
      <span className="text-muted-foreground text-xs font-semibold tabular-nums">
        {progress.done}/{progress.total}
      </span>
    </span>
  );
}

/**
 * A member on a phone (Kit's `PlayerRow`, adjusted): initials, name, and one
 * short meta line. Kit's rule for this row on mobile is that the right-hand
 * column drops and the meta shortens — so the birth year and the one contact
 * detail share a line, joined by the house separator, and the archived state
 * is carried by a badge rather than a column of its own.
 */
function MemberRow({
  member,
  presentation,
}: {
  member: Member;
  presentation: MemberFieldDefinition | null;
}) {
  const { t } = useTranslation();
  const initials =
    `${member.firstName.charAt(0)}${member.lastName.charAt(0)}`.toUpperCase();
  // The circle is the one place a phone row has for the presentation field:
  // there are no columns here, and initials next to the name they are taken
  // from say nothing a number would not say better.
  const { circle, fromField, meta: spilled } = presentationCircle(
    presentation ? member.customFields[presentation.id] : undefined,
    initials
  );
  const meta = [spilled, member.birthYear, member.email ?? member.phone]
    .filter((part) => part !== null && part !== "")
    .join(SEPARATOR);

  return (
    <Link
      to="/members/$memberId"
      params={{ memberId: member.id }}
      className="bg-card hover:bg-secondary flex min-h-tap-row items-center gap-3 rounded-lg px-4 py-3 transition-colors duration-[120ms] ease-standard"
    >
      {/* Initials repeat the name beside them, so they stay hidden from a
          screen reader. A field's value does not — it is said out loud, with
          the field's own name in front of it. */}
      <span
        aria-hidden
        className="bg-secondary text-muted-foreground flex size-10 flex-none items-center justify-center rounded-full text-sm font-bold tabular-nums"
      >
        {circle}
      </span>
      {fromField && presentation && (
        <span className="sr-only">{`${fieldLabel(presentation)}: ${circle}`}</span>
      )}
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
