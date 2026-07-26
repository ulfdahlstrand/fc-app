/**
 * Club/team switcher shown in the app header for signed-in users with at least
 * one team. Teams are grouped per club; picking one updates the shared
 * selected-team store (see lib/clubs.ts).
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  myClubsQueryOptions,
  selectTeam,
  useSelectedTeam,
} from "../lib/clubs";

export function TeamSwitcher() {
  const { t } = useTranslation();
  const clubs = useQuery(myClubsQueryOptions);
  const selected = useSelectedTeam();

  if (!clubs.data || !selected) return null;

  const multipleClubs = clubs.data.clubs.length > 1;

  return (
    <Select
      value={selected.team.id}
      onValueChange={(value) => selectTeam(value)}
    >
      <SelectTrigger
        size="sm"
        aria-label={t("switcher.label")}
        className="w-auto min-w-40 gap-2 border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {multipleClubs
          ? clubs.data.clubs.map((club) => (
              <SelectGroup key={club.id}>
                <SelectLabel>{club.name}</SelectLabel>
                {club.teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))
          : clubs.data.clubs.flatMap((club) =>
              club.teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))
            )}
      </SelectContent>
    </Select>
  );
}
