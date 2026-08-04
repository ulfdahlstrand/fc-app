/** A shadcn/ui primitive, re-themed to Kit's tokens (ADR-007, DDR-001). */
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background fixed z-50 grid gap-4 duration-200",
          // Kit: no modals, dropdowns or popovers on a phone — a choice is a
          // sheet. Below 700px this rises from the bottom edge and caps at the
          // sheet height; at 700px and up it is the centred dialog again.
          "inset-x-0 bottom-0 max-h-[var(--sheet-max-height)] overflow-y-auto rounded-t-xl p-[var(--gutter)]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          "kit:inset-x-auto kit:bottom-auto kit:top-[50%] kit:left-[50%] kit:w-full kit:max-w-[calc(100%-2rem)] kit:translate-x-[-50%] kit:translate-y-[-50%]",
          "kit:max-h-none kit:overflow-visible kit:rounded-xl kit:border kit:p-6 kit:shadow-lg",
          "kit:data-[state=closed]:slide-out-to-bottom-0 kit:data-[state=open]:slide-in-from-bottom-0",
          "kit:data-[state=closed]:zoom-out-95 kit:data-[state=open]:zoom-in-95",
          "kit:max-w-lg",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            // 44px is Kit's hard floor for anything tappable, so on a phone the
            // hit area grows around the glyph rather than the glyph growing.
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-2 right-2 inline-flex size-tap items-center justify-center rounded-pill opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none kit:top-4 kit:right-4 kit:size-auto kit:rounded-xs [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      // Kit's save bar: two buttons at most, split 1 : 2 (secondary : primary),
      // each at the 44px floor. The split is applied only when there really
      // are exactly two — `routes/posts.tsx` still has three, and they stack
      // full-width rather than being squeezed into a shape Kit does not have.
      // On desktop it reverts to a right-aligned row at natural width.
      className={cn(
        "grid grid-cols-1 gap-2 [&>*]:min-h-tap",
        "[&:has(>*:nth-child(2)):not(:has(>*:nth-child(3)))]:grid-cols-[1fr_2fr]",
        // "The save bar never scrolls away." In a sheet the content above it
        // scrolls, so the bar sticks to the bottom edge and takes the sheet's
        // own background with it.
        "bg-background sticky bottom-0 -mx-[var(--gutter)] -mb-[var(--gutter)] px-[var(--gutter)] pt-2 pb-[calc(var(--gutter)+env(safe-area-inset-bottom))]",
        "kit:static kit:mx-0 kit:mb-0 kit:flex kit:justify-end kit:p-0 kit:[&>*]:min-h-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      // Panel headings are Anton — see `.font-display` in globals.css.
      className={cn("font-display text-2xl leading-none", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
