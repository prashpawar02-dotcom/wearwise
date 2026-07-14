import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ActionRowProps {
  children: ReactNode;
  className?: string;
  /**
   * When true (default), the row is pinned via `sticky bottom-0` — meant for
   * layouts where actions should stay glued to the bottom of the scrollable
   * region above the tab bar. Pass `false` for screens (e.g. Today v2) where
   * the action row simply sits in normal document flow, at its natural
   * position in the information hierarchy, between the hero and the
   * secondary explanation content below it.
   */
  sticky?: boolean;
}

/**
 * Bottom zone of the fixed screen anatomy: primary/secondary actions live
 * in the thumb zone (bottom ~40% of the viewport, handbook §3.2). `sticky`
 * (default) pins the row just above the tab bar for scroll-heavy screens;
 * set `sticky={false}` to render it in normal flow instead.
 */
export function ActionRow({ children, className, sticky = true }: ActionRowProps) {
  return (
    <div
      className={cn(
        "z-10 flex items-center gap-2 bg-background/95 px-4 pb-4 pt-3 backdrop-blur",
        sticky && "sticky bottom-0",
        className
      )}
    >
      {children}
    </div>
  );
}
