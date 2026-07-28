/**
 * Member detail page (issue #7) — the anchor page later features extend
 * (custom fields #8, guardians #9, groups #10, attendance history #15).
 *
 * Requires members.view in the selected team; members.manage unlocks edit and
 * archive/unarchive.
 */
import { useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { GuardiansSection } from "../components/GuardiansSection";
import { formatFieldValue } from "../components/memberFieldDisplay";
import { MemberFieldValuesDialog } from "../components/MemberFieldValuesDialog";
import { MemberFormDialog } from "../components/MemberFormDialog";
import { ensureMe } from "../lib/auth";
import { ensureMyClubs, useHasPermission, useSelectedTeam } from "../lib/clubs";
import { useMemberGroups } from "../lib/groups";
import { useMemberFields, useSetMemberFieldValues } from "../lib/member-fields";
import { useMember, useSetMemberArchived, useUpdateMember } from "../lib/members";

export const Route = createFileRoute("/members_/$memberId")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) throw redirect({ to: "/login" });
    const clubs = await ensureMyClubs();
    if (clubs.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: MemberDetailPage,
});

function MemberDetailPage() {
  const { t } = useTranslation();
  const { memberId } = Route.useParams();
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

  return <MemberDetail teamId={selected.team.id} memberId={memberId} />;
}

function MemberDetail({
  teamId,
  memberId,
}: {
  teamId: string;
  memberId: string;
}) {
  const { t } = useTranslation();
  const canManage = useHasPermission("members.manage");
  const member = useMember(teamId, memberId);
  const fields = useMemberFields(teamId);
  const memberGroups = useMemberGroups(teamId, memberId);
  const updateMember = useUpdateMember(teamId);
  const setArchived = useSetMemberArchived(teamId);
  const setFieldValues = useSetMemberFieldValues(teamId);
  const [editing, setEditing] = useState(false);
  const [editingFields, setEditingFields] = useState(false);

  if (member.isPending) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }
  if (member.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("members.notFound")}</AlertDescription>
      </Alert>
    );
  }

  const m = member.data.member;
  const activeFields = fields.data?.fields ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link to="/members">← {t("members.backToList")}</Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-4xl">
            {m.firstName} {m.lastName}
          </h1>
          {m.archived && <Badge variant="secondary">{t("members.archived")}</Badge>}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              {t("common.edit")}
            </Button>
            <Button
              variant="outline"
              className={cn(
                !m.archived &&
                  "border-amber-300 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:border-amber-900 dark:text-amber-400 dark:hover:bg-amber-950",
              )}
              disabled={setArchived.isPending}
              onClick={() =>
                setArchived.mutate({ memberId: m.id, archived: !m.archived })
              }
            >
              {m.archived ? t("members.unarchive") : t("members.archive_action")}
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Field label={t("members.birthYear")} value={m.birthYear} />
          <div className="border-t" />
          <Field label={t("members.email")} value={m.email} />
          <div className="border-t" />
          <Field label={t("members.phone")} value={m.phone} />
        </CardContent>
      </Card>

      {activeFields.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-xl">{t("members.customFields")}</h2>
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => setEditingFields(true)}>
                {t("members.editFields")}
              </Button>
            )}
          </div>
          <Card>
            <CardContent className="flex flex-col gap-4">
              {activeFields.map((field, index) => (
                <div key={field.id}>
                  {index > 0 && <div className="mb-4 border-t" />}
                  <Field
                    label={field.name}
                    value={formatFieldValue(field, m.customFields[field.id], t)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {(memberGroups.data?.groups.length ?? 0) > 0 && (
        <div>
          <h2 className="mb-2 font-display text-xl">{t("groups.heading")}</h2>
          <div className="flex flex-wrap gap-2">
            {memberGroups.data?.groups.map((group) => (
              <Badge key={group.id} variant="secondary">
                {group.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <GuardiansSection teamId={teamId} memberId={m.id} />

      {editing && (
        <MemberFormDialog
          member={m}
          saving={updateMember.isPending}
          error={updateMember.isError}
          onSave={async (input) => {
            await updateMember.mutateAsync({ memberId: m.id, ...input });
            setEditing(false);
          }}
          onClose={() => setEditing(false)}
        />
      )}

      {editingFields && (
        <MemberFieldValuesDialog
          fields={activeFields}
          member={m}
          saving={setFieldValues.isPending}
          error={setFieldValues.isError}
          onSave={async (values) => {
            await setFieldValues.mutateAsync({ memberId: m.id, values });
            setEditingFields(false);
          }}
          onClose={() => setEditingFields(false)}
        />
      )}
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p>{value ?? "—"}</p>
    </div>
  );
}
