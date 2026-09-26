/**
 * The sign-in audit (ADR-027) on /admin: every attempt to sign in, newest
 * first, filterable by address and to the ones that failed.
 */
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDateLocale } from "@/lib/dates";
import { outcomeVariant, useLoginAttempts } from "@/lib/site-admin";

/** Long enough that typing an address asks once, not once per letter. */
const FILTER_DELAY_MS = 300;

export function LoginAttemptsSection() {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const [emailInput, setEmailInput] = useState("");
  const [email, setEmail] = useState("");
  const [onlyFailures, setOnlyFailures] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setEmail(emailInput), FILTER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [emailInput]);

  const query = useLoginAttempts({ email, onlyFailures });
  const attempts = query.data?.pages.flatMap((page) => page.attempts) ?? [];

  return (
    <div>
      <div className="mb-2">
        <h2 className="font-display text-xl">{t("siteAdmin.loginAttempts.heading")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("siteAdmin.loginAttempts.help")}
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4">
        <Input
          className="max-w-xs"
          type="search"
          value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)}
          placeholder={t("siteAdmin.loginAttempts.filterEmail")}
          aria-label={t("siteAdmin.loginAttempts.filterEmail")}
        />
        <label className="flex items-center gap-3 text-sm font-semibold">
          <Checkbox
            checked={onlyFailures}
            onCheckedChange={(value) => setOnlyFailures(value === true)}
          />
          {t("siteAdmin.loginAttempts.onlyFailures")}
        </label>
      </div>

      {query.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t("siteAdmin.loginAttempts.loadError")}</AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-xl bg-card px-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("siteAdmin.loginAttempts.when")}</TableHead>
                <TableHead>{t("siteAdmin.loginAttempts.email")}</TableHead>
                <TableHead>{t("siteAdmin.loginAttempts.method")}</TableHead>
                <TableHead>{t("siteAdmin.loginAttempts.outcome")}</TableHead>
                <TableHead>{t("siteAdmin.loginAttempts.ip")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attempts.map((attempt) => (
                <TableRow key={attempt.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {format(parseISO(attempt.at), "d MMM yyyy HH:mm:ss", {
                      locale,
                    })}
                  </TableCell>
                  <TableCell>
                    <div>{attempt.email ?? "—"}</div>
                    {attempt.userName && (
                      <div className="text-muted-foreground text-xs">
                        {attempt.userName}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {t(`siteAdmin.loginAttempts.methods.${attempt.method}`)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={outcomeVariant(attempt.outcome)}>
                      {t(`siteAdmin.loginAttempts.outcomes.${attempt.outcome}`)}
                    </Badge>
                  </TableCell>
                  {/* The user agent on hover: useful now and then, too wide
                      to give a column. */}
                  <TableCell
                    className="tabular-nums"
                    title={attempt.userAgent ?? undefined}
                  >
                    {attempt.ip ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!query.isPending && attempts.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="text-muted-foreground">
                    {t("siteAdmin.loginAttempts.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {query.hasNextPage && (
        <div className="mt-3">
          <Button
            variant="outline"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {t("siteAdmin.loginAttempts.more")}
          </Button>
        </div>
      )}
    </div>
  );
}
