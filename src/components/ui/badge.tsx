import * as React from "react";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  rose: "bg-rose/15 text-plum border-rose/30",
  sage: "bg-sage/20 text-foreground border-sage/40",
  gold: "bg-gold/20 text-foreground border-gold/50",
  muted: "bg-muted text-muted-foreground border-border",
  plum: "bg-plum/10 text-plum border-plum/30",
};

export function Badge({
  className,
  tone = "muted",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
