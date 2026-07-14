"use client";

import { useEffect, useRef } from "react";
import { exceedsViewport } from "@/lib/shell/scroll-audit";

/**
 * Dev-only diagnostic (handbook §3.2 One-Screen Rule): warns in the
 * console when a screen's rendered content exceeds the 1.3x viewport
 * scroll budget. Mounted once inside `<Screen/>`. Hard no-op in
 * production — no ResizeObserver, no console output, zero runtime cost.
 */
export function ScrollAudit() {
  const markerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const parent = markerRef.current?.parentElement;
    if (!parent) return;

    const check = () => {
      const contentHeight = parent.scrollHeight;
      const viewportHeight = window.innerHeight;
      if (exceedsViewport(contentHeight, viewportHeight)) {
        console.warn(
          `[ScrollAudit] ${window.location.pathname} content (${Math.round(contentHeight)}px) ` +
            `exceeds the 1.3x viewport budget (${Math.round(viewportHeight)}px) — ` +
            `One-Screen Rule violation (handbook §3.2).`
        );
      }
    };

    const observer = new ResizeObserver(check);
    observer.observe(parent);
    check();

    return () => observer.disconnect();
  }, []);

  // Zero-size marker node, used only to reach the Screen root via
  // `parentElement` for measurement. Renders nothing visible.
  return <div ref={markerRef} className="hidden" aria-hidden />;
}
