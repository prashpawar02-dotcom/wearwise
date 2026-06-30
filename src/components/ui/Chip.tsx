import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border text-xs font-medium",
  {
    variants: {
      tone: {
        default: "bg-bone border-hairline text-charcoal",
        filled: "bg-charcoal border-charcoal text-bone",
        plum: "bg-plum/[0.08] border-plum/20 text-plum",
        sage: "bg-sage/15 border-sage/30 text-[#5d7351]",
        champagne: "bg-champagne/[0.12] border-champagne/30 text-[#8a6a3e]",
        cobalt: "bg-cobalt/[0.08] border-cobalt/20 text-[#2c3a59]",
      },
      size: {
        sm: "px-2.5 py-1 text-[11px]",
        md: "px-3 py-1.5",
      },
      mono: { true: "font-mono tracking-[0.04em]", false: "" },
    },
    defaultVariants: { tone: "default", size: "md", mono: false },
  }
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {}

export function Chip({ className, tone, size, mono, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ tone, size, mono }), className)} {...props} />;
}
