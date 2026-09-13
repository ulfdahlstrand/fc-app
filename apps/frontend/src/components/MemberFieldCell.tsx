/**
 * One custom field value, edited in place from the roster (#103).
 *
 * Both shells render this same cell — the phone's card rows and the desktop's
 * table cells — so the two can never drift on what a type looks like or on
 * when a value is written.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MemberFieldDefinition } from "@fc-app/contracts";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { commitFieldValue } from "../lib/member-field-view";

/** Radix disallows an empty-string item value, so "no value" needs a sentinel. */
const NO_VALUE = "__none__";

export function MemberFieldCell({
  field,
  memberId,
  memberName,
  saved,
  onSave,
}: {
  field: MemberFieldDefinition;
  memberId: string;
  /** Part of the control's accessible name: a cell is read out of context. */
  memberName: string;
  saved: string;
  /** Resolves when the value is stored; rejects, and the cell says so. */
  onSave: (value: string | null) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [invalid, setInvalid] = useState<string | null>(null);
  const [draft, setDraft] = useState(saved);
  /**
   * In flight and failed are tracked **per cell**, not read off the shared
   * mutation. A single `useMutation` only remembers its latest `variables`,
   * so during a sweep a refused save would hand its message to whichever cell
   * was touched next, and the next success anywhere would clear a message the
   * user had not dealt with. Owning it here also disables exactly one control
   * rather than the whole squad.
   */
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * Every save invalidates `listMembers`, so a refetch lands while the user is
   * already typing in the next cell. Reconciling only when the **saved** value
   * changes leaves that draft alone; a `useEffect` on the fetched value would
   * wipe it. Same reasoning as `ValueCell` in `routes/tracking.tsx`.
   *
   * It also keeps a refused value on screen: a failed save leaves `saved`
   * untouched, so nothing typed is thrown away.
   */
  const [lastSaved, setLastSaved] = useState(saved);
  if (saved !== lastSaved) {
    setLastSaved(saved);
    setDraft(saved);
    setInvalid(null);
    setFailed(false);
  }

  const label = `${field.name} — ${memberName}`;
  const error =
    invalid ?? (failed ? t("members.cellSaveError") : null);

  const save = async (value: string | null): Promise<void> => {
    setSaving(true);
    setFailed(false);
    try {
      await onSave(value);
    } catch {
      // The draft is left exactly as typed — a refused save must not throw
      // away what someone wrote.
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Runs the draft through the contract's own validation (ADR-010) before
   * anything is sent, so a half-typed date is never a round trip.
   */
  const commit = (next: string): void => {
    const result = commitFieldValue(field, next, saved);
    if (result.action === "invalid") {
      setInvalid(t(`members.invalidValue.${field.fieldType}`));
      return;
    }
    setInvalid(null);
    if (result.action === "save") void save(result.value);
  };

  /** Boolean and select settle on change: one tap is the whole edit. */
  const choose = (next: string): void => {
    setDraft(next);
    commit(next);
  };

  return (
    <span className="flex flex-col items-stretch gap-1">
      {field.fieldType === "boolean" ? (
        <BooleanCell
          label={label}
          value={draft}
          pending={saving}
          invalid={error !== null}
          onChoose={choose}
        />
      ) : field.fieldType === "select" ? (
        <SelectCell
          field={field}
          label={label}
          value={draft}
          pending={saving}
          invalid={error !== null}
          onChoose={choose}
        />
      ) : (
        <TextCell
          field={field}
          memberId={memberId}
          label={label}
          value={draft}
          pending={saving}
          invalid={error !== null}
          onChange={setDraft}
          onCommit={() => commit(draft)}
        />
      )}
      {/* The reason belongs at the cell. One alert at the foot of a list of
          twenty-three rows is off-screen on a phone, which is where this view
          is used. */}
      {error !== null && (
        <span className="text-destructive text-xs font-semibold">{error}</span>
      )}
    </span>
  );
}

/** Text, number and date: typed freely, written when the cell is left. */
function TextCell({
  field,
  memberId,
  label,
  value,
  pending,
  invalid,
  onChange,
  onCommit,
}: {
  field: MemberFieldDefinition;
  memberId: string;
  label: string;
  value: string;
  pending: boolean;
  invalid: boolean;
  onChange: (next: string) => void;
  onCommit: () => void;
}) {
  return (
    <Input
      id={`member-field-${field.id}-${memberId}`}
      type={
        field.fieldType === "date"
          ? "date"
          : field.fieldType === "number"
            ? "number"
            : "text"
      }
      // The phone's number keyboard, as `MemberFieldValuesDialog` does it.
      {...(field.fieldType === "number"
        ? { inputMode: "decimal" as const }
        : {})}
      value={value}
      disabled={pending}
      aria-label={label}
      aria-invalid={invalid || undefined}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      // A fixed width on the phone: left to itself an input claims its
      // default twenty characters, which is wider than any of these values
      // and eats the room the name needs. The desktop lets the column decide.
      // The base Input is at Kit's 44px floor; `kit:h-9` only shrinks it back
      // to the desktop's denser row height.
      className="w-[164px] kit:h-9 kit:w-full kit:min-w-[124px]"
    />
  );
}

/**
 * A boolean has three states, not two: yes, no, and *nobody has said yet*.
 *
 * That is why this is not a `Switch`. A switch conflates "no" with "unasked",
 * which is survivable behind an explicit Save and is not survivable in a list
 * where one stray tap would write `false` onto a member nobody has asked
 * about. Undecided shows neither half chosen and reads as a dashed ring
 * (DDR-006); tapping the chosen half clears it back to undecided.
 */
function BooleanCell({
  label,
  value,
  pending,
  invalid,
  onChoose,
}: {
  label: string;
  value: string;
  pending: boolean;
  invalid: boolean;
  onChoose: (next: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <span
      role="group"
      aria-label={label}
      className={cn(
        "rounded-pill flex w-fit items-center gap-1 border-2 p-0.5",
        value === ""
          ? "border-dashed border-[var(--border-dashed)]"
          : "bg-secondary border-transparent",
        invalid && "border-destructive border-solid",
      )}
    >
      {(["true", "false"] as const).map((choice) => (
        <button
          key={choice}
          type="button"
          aria-pressed={value === choice}
          disabled={pending}
          // Tapping the chosen half clears it: back to nobody has said yet.
          onClick={() => onChoose(value === choice ? "" : choice)}
          className={cn(
            "rounded-pill flex h-9 min-w-11 items-center justify-center px-3 text-sm font-bold transition-colors duration-[120ms] ease-standard active:scale-[0.97] disabled:opacity-40",
            value === choice
              ? choice === "true"
                ? "bg-brand text-white"
                : "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          {choice === "true" ? t("common.yes") : t("common.no")}
        </button>
      ))}
    </span>
  );
}

/**
 * A select, in both shells. DDR-010 makes a choice on a phone a sheet, and
 * this is a deliberate exception: the group filter directly above this list is
 * already a `Select` on the phone, and an options list that matches its
 * neighbour beats one that matches the rule. Flagged for review — if it turns
 * out clumsy with a long option list, a sheet replaces this cell and nothing
 * else.
 */
function SelectCell({
  field,
  label,
  value,
  pending,
  invalid,
  onChoose,
}: {
  field: MemberFieldDefinition;
  label: string;
  value: string;
  pending: boolean;
  invalid: boolean;
  onChoose: (next: string) => void;
}) {
  return (
    <Select
      value={value === "" ? NO_VALUE : value}
      disabled={pending}
      onValueChange={(next) => onChoose(next === NO_VALUE ? "" : next)}
    >
      <SelectTrigger
        size="sm"
        aria-label={label}
        aria-invalid={invalid || undefined}
        className="w-[164px] kit:w-full kit:min-w-[124px]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_VALUE}>—</SelectItem>
        {field.options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
