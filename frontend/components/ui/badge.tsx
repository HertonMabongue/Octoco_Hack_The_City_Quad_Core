import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// A tag, not a pill — rounded-full status pills are the single most
// recognizable "generated admin template" tell. Small rectangular chip,
// uppercase, tracked-out letterspacing: reads as a status label on
// physical equipment rather than a UI-kit default.
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border text-foreground",
        good: "border-status-good/25 bg-status-good/10 text-status-good",
        warning: "border-status-warning/25 bg-status-warning/10 text-status-warning",
        critical: "border-status-critical/25 bg-status-critical/10 text-status-critical",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

const DOT_COLOR_CLASS: Record<string, string> = {
  good: "bg-status-good",
  warning: "bg-status-warning",
  critical: "bg-status-critical",
};

function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  const dotColorClass = (variant && DOT_COLOR_CLASS[variant]) ?? "bg-current";

  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotColorClass)} />}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
