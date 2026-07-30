/** Tracking lists (issue #19) — the matrix that replaces the spreadsheet. */
import { useMemo, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TrackingDefinition, TrackingEntry } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import { useGroups } from "../lib/groups";
import {
  cellKey,
  definitionProgress,
  entriesByCell,
  isTrackingComplete,
  useSetTrackingEntry,
  useTrackingMatrix,
} from "../lib/tracking";

export const Route = createFileRoute("/tracking")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: TrackingPage,
});

/** Sentinel — Radix disallows an empty-string select item. */
const ALL = "__all__";

function TrackingPage() {
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
        <AlertDescription>{t("tracking.forbidden")}</AlertDescription>
      </Alert>
    );
  }

  return <Tracking teamId={selected.team.id} />;
}

function Tracking({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const canManage = useHasPermission("tracking.manage");
  const [groupId, setGroupId] = useState(ALL);

  const groups = useGroups(teamId);
  const matrix = useTrackingMatrix(teamId, groupId === ALL ? undefined : groupId);

  const definitions = matrix.data?.definitions ?? [];
  const members = matrix.data?.members ?? [];
  const byCell = useMemo(
    () => entriesByCell(matrix.data?.entries ?? []),
    [matrix.data?.entries],
  );
  const memberIds = members.map((member) => member.memberId);

  const scope =
    groups.data?.groups.find((one) => one.id === groupId)?.name ??
    t("tracking.wholeSquad");

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kit-overline">{scope}</p>
          <h1 className="font-display text-4xl">{t("tracking.heading")}</h1>
        </div>
        {(groups.data?.groups.length ?? 0) > 0 && (
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger className="w-52" aria-label={t("groups.filterLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("tracking.wholeSquad")}</SelectItem>
              {groups.data?.groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {matrix.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : matrix.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("tracking.loadError")}</AlertDescription>
        </Alert>
      ) : definitions.length === 0 ? (
        <NoDefinitions />
      ) : members.length === 0 ? (
        <p className="text-muted-foreground">{t("tracking.noMembers")}</p>
      ) : (
        <Matrix
          teamId={teamId}
          definitions={definitions}
          members={members}
          memberIds={memberIds}
          byCell={byCell}
          canManage={canManage}
        />
      )}
    </div>
  );
}

function NoDefinitions() {
  const { t } = useTranslation();
  const canConfigure = useHasPermission("settings.team");

  return (
    <div className="bg-card flex flex-col gap-2 rounded-xl px-6 py-8">
      <p className="font-display text-2xl">{t("tracking.noLists")}</p>
      <p className="text-muted-foreground">{t("tracking.noListsHint")}</p>
      {canConfigure && (
        <Link
          to="/settings/team"
          className="mt-1 text-sm font-semibold underline"
        >
          {t("tracking.toSettings")}
        </Link>
      )}
    </div>
  );
}

/** The matrix itself. */
function Matrix({
  teamId,
  definitions,
  members,
  memberIds,
  byCell,
  canManage,
}: {
  teamId: string;
  definitions: TrackingDefinition[];
  members: { memberId: string; firstName: string; lastName: string }[];
  memberIds: string[];
  byCell: Map<string, TrackingEntry>;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const setEntry = useSetTrackingEntry(teamId);

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card overflow-x-auto rounded-xl">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="bg-card sticky left-0 z-10 px-4 py-3 text-left align-bottom"
              >
                <span className="kit-overline">{t("tracking.member")}</span>
              </th>
              {definitions.map((definition) => {
                const progress = definitionProgress(
                  definition,
                  memberIds,
                  byCell,
                );
                return (
                  <th
                    key={definition.id}
                    scope="col"
                    className="min-w-[132px] px-3 py-3 text-left align-bottom"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold">{definition.name}</span>
                      <span className="text-muted-foreground text-xs font-semibold tabular-nums">
                        {progress === null
                          ? t(`trackingType.${definition.valueType}`)
                          : `${progress.done}/${progress.total}`}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {members.map((member, index) => (
              <tr
                key={member.memberId}
                // Kit separates with colour, not rules: alternate rows carry a
                // faint tint so a long row stays readable across six columns.
                className={cn(
                  "group",
                  index % 2 === 1 && "bg-[var(--neutral-050)]",
                )}
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
                    params={{ memberId: member.memberId }}
                    className="hover:underline"
                  >
                    {member.firstName} {member.lastName}
                  </Link>
                </th>
                {definitions.map((definition) => (
                  <td key={definition.id} className="px-3 py-2">
                    <Cell
                      definition={definition}
                      memberId={member.memberId}
                      entry={byCell.get(cellKey(definition.id, member.memberId))}
                      canManage={canManage}
                      pending={
                        setEntry.isPending &&
                        setEntry.variables?.definitionId === definition.id &&
                        setEntry.variables?.memberId === member.memberId
                      }
                      onSet={(value) =>
                        setEntry.mutate({
                          definitionId: definition.id,
                          memberId: member.memberId,
                          value,
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {setEntry.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {setEntry.error.message ?? t("tracking.saveError")}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function Cell({
  definition,
  memberId,
  entry,
  canManage,
  pending,
  onSet,
}: {
  definition: TrackingDefinition;
  memberId: string;
  entry: TrackingEntry | undefined;
  canManage: boolean;
  pending: boolean;
  onSet: (value: string | null) => void;
}) {
  if (definition.valueType === "done") {
    return (
      <DoneCell
        definition={definition}
        entry={entry}
        canManage={canManage}
        pending={pending}
        onSet={onSet}
      />
    );
  }
  return (
    <ValueCell
      definition={definition}
      memberId={memberId}
      entry={entry}
      canManage={canManage}
      pending={pending}
      onSet={onSet}
    />
  );
}

/** Kit's tick: a green disc when it is done, a dashed ring when nobody has said yet. */
function DoneCell({
  definition,
  entry,
  canManage,
  pending,
  onSet,
}: {
  definition: TrackingDefinition;
  entry: TrackingEntry | undefined;
  canManage: boolean;
  pending: boolean;
  onSet: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const done = isTrackingComplete(definition, entry);

  const face = (
    <span
      aria-hidden
      className={cn(
        "flex size-8 items-center justify-center rounded-full text-sm font-bold transition-colors duration-[120ms] ease-standard",
        done
          ? "bg-brand text-white"
          : "border-2 border-dashed border-[var(--border-dashed)] text-[var(--neutral-500)]",
      )}
    >
      {done ? "✓" : ""}
    </span>
  );

  if (!canManage) {
    return (
      <span
        title={
          done && entry?.updatedByName !== null
            ? t("tracking.tickedBy", { name: entry?.updatedByName })
            : undefined
        }
      >
        {face}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={done}
      aria-label={definition.name}
      disabled={pending}
      title={
        done && entry?.updatedByName
          ? t("tracking.tickedBy", { name: entry.updatedByName })
          : undefined
      }
      // Clearing sends null, which deletes the entry: unticking puts the cell
      // back to "nobody has said yet".
      onClick={() => onSet(done ? null : "true")}
      className="rounded-full active:scale-[0.97] disabled:opacity-40"
    >
      {face}
    </button>
  );
}

/** A date or a note, edited in place and saved when the field loses focus. */
function ValueCell({
  definition,
  memberId,
  entry,
  canManage,
  pending,
  onSet,
}: {
  definition: TrackingDefinition;
  memberId: string;
  entry: TrackingEntry | undefined;
  canManage: boolean;
  pending: boolean;
  onSet: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const saved = entry?.value ?? "";
  const [draft, setDraft] = useState(saved);

  // The saved value is the source of truth; a refetch that changes it should
  // win over a stale draft the user has not touched.
  const [lastSaved, setLastSaved] = useState(saved);
  if (saved !== lastSaved) {
    setLastSaved(saved);
    setDraft(saved);
  }

  if (!canManage) {
    return saved === "" ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <span>{saved}</span>
    );
  }

  const commit = () => {
    if (draft.trim() === saved.trim()) return;
    onSet(draft.trim() === "" ? null : draft);
  };

  return (
    <Input
      id={`tracking-${definition.id}-${memberId}`}
      type={definition.valueType === "date" ? "date" : "text"}
      value={draft}
      disabled={pending}
      maxLength={definition.valueType === "text" ? 500 : undefined}
      aria-label={definition.name}
      placeholder={
        definition.valueType === "text" ? t("tracking.notePlaceholder") : undefined
      }
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className="h-9 w-full min-w-[120px]"
    />
  );
}
