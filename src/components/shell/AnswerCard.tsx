import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AnswerCardProps {
  children: ReactNode;
  className?: string;
}

/**
 * Middle zone of the fixed screen anatomy: the scrollable answer region
 * (hero outfit card, occasion grid, wardrobe board, etc.). Owns `flex-1`
 * + internal scroll so the context strip and action row above/below it
 * stay pinned in place — this is the ONLY part of a `<Screen/>` that
 * scrolls.
 */
export function AnswerCard({ children, className }: AnswerCardProps) {
  return (
    <div className={cn("flex-1 overflow-y-auto px-4", className)}>
      {children}
    </div>
  );
}
