import { Skeleton } from "@/components/ui/Skeleton";
import { Screen } from "@/components/shell/Screen";
import { ContextStrip } from "@/components/shell/ContextStrip";

/**
 * Today loading skeleton (Phase 4B, state A). Mirrors the REAL Today
 * hierarchy 1:1 — compact header, context strip (date/weather/occasion),
 * one hero block, one action row, one Why This Works bar, one insight line —
 * so content swaps in with no layout shift and nothing here ever reads as a
 * real recommendation (no copy, no item names, pure placeholder blocks).
 */
export default function DashboardLoading() {
  return (
    <Screen
      contextStrip={
        <ContextStrip>
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-4 w-28 rounded-full" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </ContextStrip>
      }
    >
      <div aria-busy="true" aria-label="Loading today's outfit" className="pt-1">
        {/* Compact header: greeting + avatar */}
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        </div>

        {/* Hero */}
        <Skeleton className="mt-5 h-64 w-full rounded-ww-lg" />

        {/* Primary action */}
        <Skeleton className="mt-4 h-12 w-full rounded-full" />

        {/* Secondary actions */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Skeleton className="h-9 rounded-full" />
          <Skeleton className="h-9 rounded-full" />
        </div>
        <div className="mt-2 flex justify-center">
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>

        {/* Why This Works */}
        <Skeleton className="mt-3 h-10 w-full rounded-ww-md" />

        {/* Supporting insight */}
        <Skeleton className="mt-3 h-10 w-full rounded-ww-md" />
      </div>
    </Screen>
  );
}
