/**
 * Profile route — the signed-in user's own account: identity from the OAuth
 * provider, language preference, and sign-out.
 */
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import i18n, { supportedLanguages } from "../i18n/i18n";
import { ensureMe, logout, meQueryOptions } from "../lib/auth";
import { selectTeam } from "../lib/clubs";
import { useMyMembers } from "../lib/guardians";

export const Route = createFileRoute("/profile")({
  beforeLoad: async () => {
    const user = await ensureMe();
    if (!user) {
      throw redirect({ to: "/login" });
    }
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    await navigate({ to: "/login" });
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <UserAvatar name={user.name} imageUrl={user.imageUrl} />
            <div>
              <p className="text-lg font-semibold">{user.name}</p>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t("profile.language")}</p>
            <div className="inline-flex w-fit gap-1 rounded-pill bg-card p-1">
              {supportedLanguages.map((language) => (
                <Button
                  key={language}
                  type="button"
                  size="sm"
                  variant={
                    i18n.resolvedLanguage === language ? "default" : "ghost"
                  }
                  onClick={() => void i18n.changeLanguage(language)}
                >
                  {t(`profile.languages.${language}`)}
                </Button>
              ))}
            </div>
          </div>

          <Button variant="outline" onClick={handleLogout}>
            {t("profile.logout")}
          </Button>
        </CardContent>
      </Card>

      <MyMembers />
    </div>
  );
}

function UserAvatar({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className="size-14 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-medium text-muted-foreground">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function MyMembers() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myMembers = useMyMembers();

  const members = myMembers.data?.members ?? [];
  if (members.length === 0) return null;

  return (
    <Card className="w-full max-w-md">
      <CardContent className="flex flex-col gap-3">
        <h2 className="font-display text-xl">{t("profile.myMembers")}</h2>
        {members.map((member) => (
          <button
            key={member.memberId}
            type="button"
            className="flex items-center justify-between gap-2 rounded-lg bg-card p-3 text-left transition-colors hover:bg-accent"
            onClick={() => {
              selectTeam(member.teamId);
              void navigate({
                to: "/members/$memberId",
                params: { memberId: member.memberId },
              });
            }}
          >
            <div>
              <p className="font-medium">
                {member.firstName} {member.lastName}
              </p>
              <p className="text-sm text-muted-foreground">
                {member.clubName} — {member.teamName}
              </p>
            </div>
            <Badge variant="secondary">
              {t(`guardians.relation.${member.relation}`)}
            </Badge>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
