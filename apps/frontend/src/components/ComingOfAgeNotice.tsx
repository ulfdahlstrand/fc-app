/**
 * Saying, in advance, that a member is about to become responsible for
 * themselves (#66).
 *
 * Two audiences, two things worth knowing:
 * - a parent needs a month's warning that the player will handle this alone;
 * - a coach needs to know the address on file is still a parent's.
 *
 * Neither is a change. Nothing here writes, no access is revoked, and no link
 * is removed — turning eighteen ends the legal guardianship, not the family.
 */
import { useTranslation } from "react-i18next";
import { comingOfAge, type GuardianRelation } from "@fc-app/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDateLong, useDateLocale } from "@/lib/dates";

/**
 * How a linked account should be described. Once the member is eighteen a
 * parent is still a parent, so the badge stops claiming guardianship rather
 * than the link disappearing. Derived from the birth date every time it is
 * read: an age in a column is right until the next birthday.
 */
export function relationLabelKey(
  relation: GuardianRelation,
  birthDate: string | null
): string {
  if (relation === "self") return "guardians.relation.self";
  return comingOfAge(birthDate).isAdult
    ? "guardians.relation.family"
    : "guardians.relation.guardian";
}

/** Shown to a guardian, on their own profile, a month ahead. */
export function ComingOfAgeNoticeForGuardian({
  name,
  birthDate,
}: {
  name: string;
  birthDate: string | null;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const state = comingOfAge(birthDate);

  if (!state.approaching || state.eighteenthOn === null) return null;

  return (
    <Alert>
      <AlertDescription>
        {t("guardians.turningEighteen", {
          name,
          date: formatDateLong(state.eighteenthOn, locale),
        })}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Shown on the member page. `sharedAddress` is computed by the caller from the
 * member's contacts rather than stored, so it corrects itself the moment
 * either address changes.
 */
export function ComingOfAgeNoticeForTeam({
  birthDate,
  sharedAddress,
}: {
  birthDate: string | null;
  sharedAddress: boolean;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const state = comingOfAge(birthDate);

  const dueSoon = state.approaching && state.eighteenthOn !== null;
  if (!dueSoon && !sharedAddress) return null;

  return (
    <Alert>
      <AlertDescription className="flex flex-col gap-1">
        {dueSoon && state.eighteenthOn !== null && (
          <span>
            {t("members.turningEighteen", {
              date: formatDateLong(state.eighteenthOn, locale),
            })}
          </span>
        )}
        {sharedAddress && <span>{t("members.addressIsGuardians")}</span>}
      </AlertDescription>
    </Alert>
  );
}
