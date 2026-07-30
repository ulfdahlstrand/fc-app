/** A shadcn/ui primitive, re-themed to Kit's tokens (ADR-007, DDR-001). */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Kit badge: a full pill, semibold, no border by default. */
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-pill px-2.5 py-0.5 text-xs font-semibold w-fit whitespace-nowrap shrink-0 gap-1 [&>svg]:size-3 [&>svg]:pointer-events-none focus-visible:ring-ring/60 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 transition-colors duration-[120ms] ease-standard overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-ink-raised",
        brand: "bg-brand text-white [a&]:hover:bg-brand-strong",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-[var(--neutral-250)]",
        destructive:
          "bg-destructive text-destructive-foreground [a&]:hover:bg-[var(--orange-800)]",
        outline:
          "border-2 border-[var(--border-strong)] text-foreground [a&]:hover:bg-accent",
        present: "bg-surface-present text-present",
        absent: "bg-surface-absent text-absent",
        late: "bg-surface-late text-late",
        unset:
          "border-[1.5px] border-dashed border-[var(--border-dashed)] text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
