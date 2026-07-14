import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TabBar } from "@/components/shell/TabBar";
import { ScrollAudit } from "@/components/shell/ScrollAudit";
import { AnswerCard } from "@/components/shell/AnswerCard";

interface ScreenProps {
  contextStrip?: ReactNode;
  actionRow?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Shared One-Screen shell (handbook §3.2, §4.3), reused by every tab from
 * Phase 4B onward. Fixed anatomy: context strip (top) → scrollable answer
 * region (flex-1, `children`, auto-wrapped in `AnswerCard`) → action row
 * (thumb zone) → bottom tab bar. 380px baseline; width matches the app
 * shell (`(app)/layout.tsx`, max-w-440px); token-only styling, no raw hex.
 *
 * Slot-based API — callers pass `contextStrip`/`actionRow` built from
 * `ContextStrip`/`ActionRow`; `children` is the answer-region content.
 * No hooks live here beyond mounting the dev-only `ScrollAudit`.
 *
 * NOT wired into any real page yet — that's Phase 4B (handoff §5).
 */
export function Screen({ contextStrip, actionRow, children, className }: ScreenProps) {
  return (
    <div className={cn("flex min-h-dvh w-full flex-col bg-background", className)}>
      <ScrollAudit />
      {contextStrip}
      <AnswerCard>{children}</AnswerCard>
      {actionRow}
      {/* Spacer reserving room for the fixed TabBar so the last piece of
          in-flow content (action row) isn't rendered underneath it. */}
      <div className="h-16" aria-hidden />
      <TabBar />
    </div>
  );
}
