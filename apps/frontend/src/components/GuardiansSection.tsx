/**
 * Guardians section on the member detail page (issue #9). Lists linked user
 * accounts and, with members.manage, lets a manager link an existing club
 * user (as guardian or self) or unlink one.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { GuardianRelation } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useHasPermission } from "../lib/clubs";
import {
  useAddGuardian,
  useClubUsers,
  useMemberGuardians,
  useRemoveGuardian,
} from "../lib/guardians";

export function GuardiansSection({
  teamId,
  memberId,
}: {
  teamId: string;
  memberId: string;
}) {
  const { t } = useTranslation();
  const canManage = useHasPermission("members.manage");
  const guardians = useMemberGuardians(teamId, memberId);
  const removeGuardian = useRemoveGuardian(teamId, memberId);
  const [linking, setLinking] = useState(false);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("guardians.heading")}</h2>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setLinking(true)}>
            {t("guardians.link")}
          </Button>
        )}
      </div>

      {guardians.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : guardians.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("guardians.loadError")}</AlertDescription>
        </Alert>
      ) : guardians.data.guardians.length === 0 ? (
        <p className="text-muted-foreground">{t("guardians.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {guardians.data.guardians.map((guardian) => (
            <div
              key={guardian.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{guardian.name}</p>
                  <Badge variant="secondary">
                    {t(`guardians.relation.${guardian.relation}`)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{guardian.email}</p>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  className={cn("text-destructive hover:text-destructive")}
                  disabled={removeGuardian.isPending}
                  onClick={() => removeGuardian.mutate(guardian.userId)}
                >
                  {t("guardians.unlink")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {linking && (
        <LinkGuardianDialog
          teamId={teamId}
          memberId={memberId}
          linkedUserIds={
            new Set(guardians.data?.guardians.map((g) => g.userId) ?? [])
          }
          onClose={() => setLinking(false)}
        />
      )}
    </div>
  );
}

function LinkGuardianDialog({
  teamId,
  memberId,
  linkedUserIds,
  onClose,
}: {
  teamId: string;
  memberId: string;
  linkedUserIds: Set<string>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const clubUsers = useClubUsers(teamId);
  const addGuardian = useAddGuardian(teamId, memberId);
  const [userId, setUserId] = useState("");
  const [relation, setRelation] = useState<GuardianRelation>("guardian");

  const available = (clubUsers.data?.users ?? []).filter(
    (user) => !linkedUserIds.has(user.id)
  );

  const handleLink = async () => {
    await addGuardian.mutateAsync({ userId, relation });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("guardians.linkTitle")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {addGuardian.isError && (
            <Alert variant="destructive">
              <AlertDescription>{t("guardians.linkError")}</AlertDescription>
            </Alert>
          )}
          {available.length === 0 ? (
            <Alert>
              <AlertDescription>{t("guardians.noUsers")}</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="guardian-user">{t("guardians.user")}</Label>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger id="guardian-user" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="guardian-relation">
                  {t("guardians.relationLabel")}
                </Label>
                <Select
                  value={relation}
                  onValueChange={(value) =>
                    setRelation(value as GuardianRelation)
                  }
                >
                  <SelectTrigger id="guardian-relation" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="guardian">
                      {t("guardians.relation.guardian")}
                    </SelectItem>
                    <SelectItem value="self">
                      {t("guardians.relation.self")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            type="button"
            onClick={handleLink}
            disabled={userId === "" || addGuardian.isPending}
          >
            {t("guardians.link")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
