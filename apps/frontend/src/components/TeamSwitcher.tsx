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
} from "@/lib/clubs";

export function TeamSwitcher() {
  const { t } = useTranslation();
  const clubs = useQuery(myClubsQueryOptions);
  const selected = useSelectedTeam();

  if (!clubs.data || !selected) return null;

  const multipleClubs = clubs.data.clubs.length > 1;

  return (
    <Select value={selected.team.id} onValueChange={selectTeam}>
      <SelectTrigger size="sm" aria-label={t("switcher.label")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {clubs.data.clubs.map((club) => (
          <SelectGroup key={club.id}>
            {multipleClubs && <SelectLabel>{club.name}</SelectLabel>}
            {club.teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {multipleClubs ? `${team.name} — ${club.name}` : team.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
