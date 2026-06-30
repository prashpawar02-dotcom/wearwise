import * as React from "react";
import { cn } from "@/lib/utils";

export interface ReasoningItem {
  /** Eyebrow tag, e.g. "Style", "Weather", "Occasion". */
  tag: string;
  body: string;
  icon?: React.ReactNode;
}

/** "Why this works" — a small set of editorial reasoning cards. */
export function ReasoningCards({
  items,
  className,
}: {
  items: ReasoningItem[];
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      {items.map((r, i) => (
        <div key={`${r.tag}-${i}`} className="rounded-ww-md border border-hairline bg-bone p-4 shadow-ww-xs">
          <div className="mb-1 flex items-center gap-2">
            {r.icon}
            <span className="ww-eyebrow">{r.tag}</span>
          </div>
          <p className="text-sm leading-relaxed text-charcoal">{r.body}</p>
        </div>
      ))}
    </div>
  );
}
