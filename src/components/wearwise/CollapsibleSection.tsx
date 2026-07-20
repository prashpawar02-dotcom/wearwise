"use client";

// =====================================================================
// WearWise — Accessible collapsible board section (Phase 5, Module C2)
// Real <button> toggle with aria-expanded/aria-controls, ≥44px target,
// reduced-motion respected, title + count always visible when collapsed.
// Collapse is LOCAL UI state (never user business data, no DB column).
// Emits `board_section_toggled` ONLY on an explicit user toggle — never on
// initial render/hydration.
// =====================================================================

import { useId, useState, type ReactNode } from "react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export function CollapsibleSection({
  sectionKey,
  title,
  subtitle,
  meta,
  defaultOpen = true,
  children,
}: {
  /** Stable, privacy-safe key (e.g. "hanging"). Sent in telemetry. */
  sectionKey: string;
  title: string;
  subtitle?: string;
  /** Right-aligned count/summary — stays visible when collapsed. */
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  function toggle() {
    const next = !open;
    setOpen(next);
    // Explicit user action only. Minimal, identity-free payload.
    track("board_section_toggled", { section_key: sectionKey, expanded: next, source: "wardrobe_board" });
  }

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-h-[44px] flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-ww-sm"
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-mist transition-transform duration-200 ease-out motion-reduce:transition-none",
              open ? "" : "-rotate-90",
            )}
          >
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="min-w-0">
            <span className="ww-eyebrow block text-plum">{title}</span>
            {subtitle && <span className="block text-xs text-graphite">{subtitle}</span>}
          </span>
        </button>
        {meta != null && <span className="whitespace-nowrap text-[11px] text-mist">{meta}</span>}
      </div>
      <div id={bodyId} hidden={!open}>
        {open ? children : null}
      </div>
    </div>
  );
}
