"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { track } from "@/lib/analytics";

/**
 * Why This Works — collapsible chip (handbook §5 P3 + §3.5 explainability).
 * Renders the top-3 positive factor contributions, ONE plain-language line each,
 * exactly as produced by the scoring engine (strings map 1:1 to stored factors —
 * never free-generated here). Collapsed by default to respect the One-Screen
 * Rule; expands in place. Fires the canonical why_this_works_opened event
 * once per collapsed -> expanded transition. A separate expand event used
 * to fire alongside this one; it was retired as a duplicate (see
 * CHANGELOG.md, Phase 4B telemetry-dedup fix).
 */
export function WhyThisWorks({
  lines,
  source = "today",
}: {
  lines: string[];
  source?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!lines || lines.length === 0) return null;

  return (
    <div className="mt-3 rounded-ww-md border border-lavender/40 bg-lavender/[0.12]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          // Canonical event: why_this_works_opened, fired only on the
          // collapsed -> expanded transition (single fire per expansion).
          // The old duplicate expand event was retired — see CHANGELOG.md.
          if (next) {
            track("why_this_works_opened", { source, line_count: lines.length });
          }
        }}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="ww-eyebrow text-plum">Why this works</span>
        <span
          aria-hidden="true"
          className={`text-plum transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <Icon.More className="h-4 w-4" />
        </span>
      </button>
      {open && (
        <ul className="space-y-1.5 px-3 pb-3">
          {lines.slice(0, 3).map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-snug text-charcoal">
              <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-plum" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
