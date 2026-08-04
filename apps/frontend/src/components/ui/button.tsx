/** A shadcn/ui primitive, re-themed to Kit's tokens (ADR-007, DDR-001). */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Kit buttons: full pill, bold Archivo, no shadow. */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-bold transition-[background-color,color,transform] duration-[120ms] ease-standard active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/60 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-ink-raised",
        brand: "bg-brand text-white hover:bg-brand-strong",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-[var(--orange-800)] focus-visible:ring-destructive/30",
        // The 2px ink outline is one of only two borders Kit allows.
        outline:
          "border-2 border-[var(--border-strong)] bg-transparent text-foreground hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-[var(--neutral-250)]",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-[var(--link)] underline-offset-4 hover:underline hover:text-[var(--link-hover)]",
      },
      size: {
        // `default` is already Kit's `md` — the 44px touch floor. On a phone
        // the other two collapse onto it: "Buttons use size md (44px), never
        // lg, and never a custom height."
        default: "h-11 px-[22px] text-[15px] has-[>svg]:px-5",
        sm: "h-tap gap-1.5 px-4 text-sm has-[>svg]:px-3 kit:h-9",
        lg: "h-tap px-7 text-base has-[>svg]:px-6 kit:h-13",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
