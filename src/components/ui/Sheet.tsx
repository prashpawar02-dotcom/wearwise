"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";

/**
 * Sheet — WearWise's bottom sheet primitive (handbook §3.3 "sheets over pages",
 * §4.3 anatomy). Grabber + title, backdrop blur, spring-in ~220ms, ≤1 screen
 * tall, thumb-zone actions. Closes on backdrop tap or Escape. Respects
 * prefers-reduced-motion (the animation utilities themselves are motion-gated
 * in globals.css). No browser storage; state is owned by the caller.
 *
 * Accessibility: role="dialog" + aria-modal, labelled by the title, initial
 * focus moved into the sheet, body scroll locked while open.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** When false, backdrop/Escape won't close (caller must resolve an action). */
  dismissable?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the sheet for keyboard + screen-reader users.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, dismissable, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => dismissable && onClose()}
        className="absolute inset-0 bg-charcoal/30 backdrop-blur-sm animate-fade-in"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-md rounded-t-[24px] border border-hairline bg-ivory",
          "max-h-[85dvh] overflow-y-auto pb-[max(env(safe-area-inset-bottom),1rem)] shadow-ww-lg outline-none",
          "animate-sheet-in"
        )}
      >
        {/* Grabber */}
        <div className="sticky top-0 z-10 flex flex-col items-center gap-2 rounded-t-[24px] bg-ivory/95 pt-2.5 backdrop-blur-sm">
          <span className="h-1 w-10 rounded-full bg-mist/70" aria-hidden="true" />
          <div className="flex w-full items-start justify-between gap-3 px-5 pb-2 pt-1">
            <div className="min-w-0">
              <h2 className="font-serif text-xl leading-tight text-charcoal">{title}</h2>
              {subtitle && <p className="mt-0.5 text-sm text-graphite">{subtitle}</p>}
            </div>
            {dismissable && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-stone/50 hover:text-charcoal"
              >
                <Icon.Close className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="px-5 pt-1">{children}</div>

        {footer && <div className="sticky bottom-0 mt-3 bg-ivory/95 px-5 pt-3 backdrop-blur-sm">{footer}</div>}
      </div>
    </div>
  );
}
