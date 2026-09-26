/**
 * "Suggest a password" — beside every field where an admin sets someone else's
 * password (ADR-026).
 *
 * It exists because the alternative is worse: an admin who has to invent a
 * password for twenty accounts invents `Fotboll2026!` twenty times. One tap
 * gives a readable random one instead, and copying it is right next to it
 * because the password then has to reach its owner.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { suggestPassword } from "@/lib/password-suggest";

export function SuggestPasswordButton({
  value,
  onSuggest,
}: {
  /** The field's current value — what the copy button puts on the clipboard. */
  value: string;
  onSuggest: (password: string) => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onSuggest(suggestPassword())}
      >
        {t("siteAdmin.suggestPassword")}
      </Button>
      {value !== "" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            // A browser that refuses the clipboard is not an error worth a
            // dialog: the password is on screen and can be selected by hand.
            copy().catch(() => undefined);
          }}
        >
          {copied ? t("common.copied") : t("siteAdmin.copyPassword")}
        </Button>
      )}
    </div>
  );
}
