import { cn } from "@/lib/utils";

/**
 * WearWise loading skeleton — a calm, warm placeholder block. Uses the design
 * system's stone tone + a gentle pulse. Decorative only (aria-hidden); wrap the
 * surrounding region with aria-busy so assistive tech announces the loading.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-ww-sm bg-stone/70", className)} />;
}
