/**
 * Club/team switcher shown in the AppBar for signed-in users with at least
 * one team. Teams are grouped per club; picking one updates the shared
 * selected-team store (see lib/clubs.ts).
 */
import ListSubheader from "@mui/material/ListSubheader";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
      size="small"
      value={selected.team.id}
      onChange={(event) => selectTeam(event.target.value)}
      aria-label={t("switcher.label")}
      sx={{
        mr: 2,
        color: "inherit",
        ".MuiSelect-icon": { color: "inherit" },
        ".MuiOutlinedInput-notchedOutline": {
          borderColor: "rgba(255, 255, 255, 0.5)",
        },
      }}
    >
      {clubs.data.clubs.flatMap((club) => [
        ...(multipleClubs
          ? [<ListSubheader key={club.id}>{club.name}</ListSubheader>]
          : []),
        ...club.teams.map((team) => (
          <MenuItem key={team.id} value={team.id}>
            {multipleClubs ? `${team.name} — ${club.name}` : team.name}
          </MenuItem>
        )),
      ])}
    </Select>
  );
}
