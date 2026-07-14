import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ContextStripProps {
  children: ReactNode;
  className?: string;
}

/**
 * Top zone of the fixed screen anatomy (handbook §4.3): one line, sticky
 * at the top of the scroll region, never scrolls away. Callers compose
 * their own content (greeting, weather chip, occasion chip, week strip,
 * etc.) — this component only owns the position/spacing contract.
 */
export function ContextStrip({ children, className }: ContextStripProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex items-center gap-2 bg-background/95 px-4 pb-3 pt-4 backdrop-blur",
        className
      )}
    >
      {children}
    </div>
  );
}
