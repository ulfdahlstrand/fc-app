/**
 * A row's secondary actions behind a `…`, so the row itself can do the one
 * thing it is clicked for and the rest stays out of the way until asked for.
 *
 * Desktop gets a dropdown. On a phone a choice is a sheet (DDR-010), so the
 * same actions open as tiles from the bottom, titled with what the row is —
 * the sheet covers the row, and nothing else would say whose actions these are.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { EllipsisIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface RowAction {
  label: string;
  onSelect: () => void;
}

const itemClass =
  "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground";

/** Same tile as a `MenuSheet` row. */
const sheetRowClass =
  "bg-card flex min-h-tap-row items-center rounded-lg px-4 text-left text-[15px] font-semibold transition-colors duration-[120ms] ease-standard hover:bg-accent";

export function RowActions({
  compact,
  title,
  label,
  actions,
}: {
  /** Phone shape: a sheet instead of a dropdown. */
  compact: boolean;
  /** What the row is — the sheet's heading. */
  title: string;
  /** The trigger's accessible name. */
  label: string;
  actions: RowAction[];
}) {
  const [open, setOpen] = useState(false);

  const trigger = (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={label}
      title={label}
      // The row has its own click; opening the menu must not trigger it.
      onClick={(event) => {
        event.stopPropagation();
        if (compact) setOpen(true);
      }}
      className="flex-none"
    >
      <EllipsisIcon aria-hidden className="size-5" />
    </Button>
  );

  if (compact) {
    return (
      <>
        {trigger}
        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay
              className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 duration-[180ms]"
              style={{ background: "var(--sheet-scrim)" }}
            />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className={cn(
                "bg-background fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 overflow-y-auto rounded-t-xl px-[var(--gutter)] pt-[10px] pb-[26px]",
                "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-[180ms] ease-standard",
              )}
              style={{ maxHeight: "var(--sheet-max-height)" }}
            >
              <span
                aria-hidden
                className="bg-neutral-300 h-[5px] w-11 flex-none self-center rounded-[5px]"
              />
              <DialogPrimitive.Title className="kit-overline">
                {title}
              </DialogPrimitive.Title>
              <div className="flex flex-col gap-2">
                {actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={sheetRowClass}
                    onClick={() => {
                      setOpen(false);
                      action.onSelect();
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </>
    );
  }

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          // Clicks inside the portal still bubble through React to the row.
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "bg-popover text-popover-foreground z-50 min-w-44 rounded-md border p-1 shadow-md",
            "origin-(--radix-dropdown-menu-content-transform-origin)",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          {actions.map((action) => (
            <DropdownMenu.Item
              key={action.label}
              className={itemClass}
              onSelect={action.onSelect}
            >
              {action.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
